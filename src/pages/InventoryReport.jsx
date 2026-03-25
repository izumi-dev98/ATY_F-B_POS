import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import supabase from "../createClients";

export default function InventoryReport() {
  const [inventory, setInventory] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Date filter: "all", "day", "week", "month", "year"
  const [dateFilter, setDateFilter] = useState("all");

  // Custom date range
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Modal state for purchase details
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 5;

  const mmkFormatter = new Intl.NumberFormat("en-MM", {
    style: "currency",
    currency: "MMK",
    maximumFractionDigits: 0,
  });
  const toFiniteNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };
  const formatMMK = (value) => mmkFormatter.format(toFiniteNumber(value));
  const normalizeName = (value) => value?.toString().trim().toLowerCase() || "";
  const normalizeType = (value) => {
    const normalized = value?.toString().trim().toLowerCase();
    return normalized || "-";
  };
  const buildItemKey = (itemName, itemType) => `${normalizeName(itemName)}::${normalizeType(itemType)}`;
  const buildNameOnlyKey = (itemName) => `${normalizeName(itemName)}::*`;

  // Store purchase price history per item (latest first)
  const [priceHistoryByItem, setPriceHistoryByItem] = useState({});

  const getPriceHistory = (itemName, itemType) => {
    const exactKey = buildItemKey(itemName, itemType);
    const fallbackKey = buildNameOnlyKey(itemName);
    return priceHistoryByItem[exactKey]?.length
      ? priceHistoryByItem[exactKey]
      : (priceHistoryByItem[fallbackKey] || []);
  };

  const getLatestUnitPrice = (itemName, itemType) => {
    const history = getPriceHistory(itemName, itemType);
    const price = history[0];
    return price !== undefined && price !== null ? Number(price) : null;
  };

  const getEffectiveUnitPrice = (itemName, itemType, inventoryPrice) => {
    const latest = getLatestUnitPrice(itemName, itemType);
    if (latest !== null) return latest;
    return inventoryPrice !== undefined && inventoryPrice !== null
      ? Number(inventoryPrice) || 0
      : 0;
  };

  // Total Value format requested:
  // Qty 2 => sum of latest 2 purchase prices for the same item.
  const getTotalValueByQty = (itemName, itemType, qty, inventoryPrice) => {
    const history = getPriceHistory(itemName, itemType);
    const fallbackPrice = inventoryPrice !== undefined && inventoryPrice !== null
      ? Number(inventoryPrice) || 0
      : 0;
    const numericQty = Number(qty) || 0;

    if (numericQty <= 0) return 0;

    const fullUnits = Math.floor(numericQty);
    const remainder = numericQty - fullUnits;
    let total = 0;

    for (let i = 0; i < fullUnits; i += 1) {
      const unitPrice = history[i] !== undefined && history[i] !== null
        ? Number(history[i]) || 0
        : fallbackPrice;
      total += unitPrice;
    }

    if (remainder > 0) {
      const remainderUnitPrice = history[fullUnits] !== undefined && history[fullUnits] !== null
        ? Number(history[fullUnits]) || 0
        : (history[0] !== undefined && history[0] !== null
            ? Number(history[0]) || fallbackPrice
            : fallbackPrice);
      total += remainderUnitPrice * remainder;
    }

    return total;
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    setLoading(true);

    // Get all received purchases first
    const { data: purchases } = await supabase
      .from("purchases")
      .select("id")
      .eq("status", "received");

    const receivedPurchaseIds = purchases?.map(p => p.id) || [];

    // Get add_stock records from internal_consumption
    const { data: addStockRecords } = await supabase
      .from("internal_consumption")
      .select("id")
      .eq("status", "add_stock")
      .order("created_at", { ascending: false });

    const addStockIds = addStockRecords?.map(r => r.id) || [];

    const [invData, supData, purchaseItemsData, addStockItemsData] = await Promise.all([
      supabase.from("inventory").select("*").order("item_name", { ascending: true }),
      supabase.from("suppliers").select("id, name").order("name", { ascending: true }),
      receivedPurchaseIds.length > 0
        ? supabase.from("purchase_items").select("item_name, type, unit_price").in("purchase_id", receivedPurchaseIds).order("id", { ascending: false })
        : Promise.resolve({ data: [] }),
      addStockIds.length > 0
        ? supabase.from("internal_consumption_items").select("inventory_id, qty, unit_price").in("consumption_id", addStockIds).order("id", { ascending: false })
        : Promise.resolve({ data: [] })
    ]);

    if (!invData.error) setInventory(invData.data);
    if (!supData.error) setSuppliers(supData.data || []);

    // Build purchase price history per item (latest first)
    const priceHistory = {};

    // From purchase_items
    if (purchaseItemsData.data) {
      purchaseItemsData.data.forEach(item => {
        const nameKey = normalizeName(item.item_name);
        if (nameKey) {
          const exactKey = buildItemKey(item.item_name, item.type);
          const fallbackKey = buildNameOnlyKey(item.item_name);
          if (!priceHistory[exactKey]) priceHistory[exactKey] = [];
          if (!priceHistory[fallbackKey]) priceHistory[fallbackKey] = [];
          priceHistory[exactKey].push(item.unit_price);
          priceHistory[fallbackKey].push(item.unit_price);
        }
      });
    }

    // From add_stock items - merge with inventory name
    if (addStockItemsData.data && invData.data) {
      const inventoryMap = {};
      invData.data.forEach(inv => {
        inventoryMap[inv.id] = {
          exactKey: buildItemKey(inv.item_name, inv.type),
          fallbackKey: buildNameOnlyKey(inv.item_name),
        };
      });

      addStockItemsData.data.forEach(item => {
        const keyPair = inventoryMap[item.inventory_id];
        if (keyPair && item.unit_price) {
          if (!priceHistory[keyPair.exactKey]) priceHistory[keyPair.exactKey] = [];
          if (!priceHistory[keyPair.fallbackKey]) priceHistory[keyPair.fallbackKey] = [];
          priceHistory[keyPair.exactKey].push(item.unit_price);
          priceHistory[keyPair.fallbackKey].push(item.unit_price);
        }
      });
    }

    setPriceHistoryByItem(priceHistory);
    setLoading(false);
  };

  // View stock history for an item (Purchase + Add Stock mixed, sorted by date oldest first)
  const viewPurchaseHistory = async (item) => {
    setSelectedItem(item);

    const getFifoTimestamp = (value) => {
      if (!value) return Number.POSITIVE_INFINITY;
      const ts = new Date(value).getTime();
      return Number.isNaN(ts) ? Number.POSITIVE_INFINITY : ts;
    };

    // Use the item directly since it comes from inventory table
    const targetInv = item;
    const targetName = normalizeName(targetInv.item_name);
    const targetType = normalizeType(targetInv.type);
    const targetId = item.id;

    // Fetch received purchases with created_at for accurate FIFO
    const { data: purchases, error: purchasesErr } = await supabase
      .from("purchases")
      .select("id, date, created_at, invoice_number, supplier_id, status")
      .eq("status", "received");

    if (purchasesErr) {
      console.error("Error fetching purchases:", purchasesErr);
    }

    const purchaseIds = purchases?.map(p => p.id) || [];

    // Fetch add_stock records ordered by date (FIFO)
    const { data: addStockRecords, error: addStockErr } = await supabase
      .from("internal_consumption")
      .select("id, created_at")
      .eq("status", "add_stock")
      .order("created_at", { ascending: true });

    if (addStockErr) {
      console.error("Error fetching add_stock records:", addStockErr);
    }

    const addStockIds = addStockRecords?.map(r => r.id) || [];

    const history = [];

    // Add purchase items - match by name and type from inventory
    if (purchaseIds.length > 0) {
      const { data: purchaseItems, error: purchaseItemsErr } = await supabase
        .from("purchase_items")
        .select("id, qty, unit_price, purchase_id, item_name, type")
        .in("purchase_id", purchaseIds);

      if (purchaseItemsErr) {
        console.error("Error fetching purchase_items:", purchaseItemsErr);
      }

      if (purchaseItems) {
        // Match by name and type (exact match first, fallback to name-only)
        const exactMatches = purchaseItems.filter((pi) =>
          normalizeName(pi.item_name) === targetName &&
          normalizeType(pi.type) === targetType
        );
        const matchedPurchaseItems = exactMatches.length > 0
          ? exactMatches
          : purchaseItems.filter((pi) => normalizeName(pi.item_name) === targetName);

        matchedPurchaseItems.forEach(pi => {
          const purchase = purchases?.find(p => p.id === pi.purchase_id);
          if (purchase) {
            // Use created_at for FIFO (more accurate than date only)
            const fifoDate = purchase.created_at || purchase.date;
            history.push({
              ...pi,
              purchase_date: purchase.date || "-",
              fifo_date: fifoDate,
              invoice_number: purchase.invoice_number || "-",
              supplier_id: purchase.supplier_id,
              source_type: "Purchase",
              status: purchase.status || "received",
              qty: parseFloat(pi.qty) || 0,
              unit_price: parseFloat(pi.unit_price) || 0
            });
          }
        });
      }
    }

    // Add add_stock items - match by inventory_id
    if (addStockIds.length > 0) {
      const { data: addStockItems, error: addStockItemsErr } = await supabase
        .from("internal_consumption_items")
        .select("id, qty, unit_price, consumption_id, inventory_id")
        .in("consumption_id", addStockIds);

      if (addStockItemsErr) {
        console.error("Error fetching internal_consumption_items:", addStockItemsErr);
      }

      if (addStockItems) {
        const addStockMap = {};
        addStockRecords?.forEach(r => {
          addStockMap[r.id] = r.created_at;
        });

        const matchedAddStockItems = addStockItems.filter(ai => ai.inventory_id === targetId);

        matchedAddStockItems.forEach(ai => {
          const createdAt = addStockMap[ai.consumption_id];
          history.push({
            id: ai.id,
            item_name: targetInv.item_name,
            qty: parseFloat(ai.qty) || 0,
            unit_price: parseFloat(ai.unit_price) || 0,
            total_price: (parseFloat(ai.qty) || 0) * (parseFloat(ai.unit_price) || 0),
            purchase_date: createdAt ? new Date(createdAt).toISOString().split('T')[0] : "-",
            fifo_date: createdAt || null,
            invoice_number: "-",
            supplier_id: null,
            source_type: "Add Stock",
            status: "add_stock"
          });
        });
      }
    }

    // Keep list in FIFO order for consistent usage-reduction tracing
    // Sorted by date/time only - earliest first
    history.sort((a, b) => {
      const tsA = getFifoTimestamp(a.fifo_date);
      const tsB = getFifoTimestamp(b.fifo_date);
      if (tsA !== tsB) return tsA - tsB;
      return (Number(a.id) || 0) - (Number(b.id) || 0);
    });

    setPurchaseHistory(history);
    setShowDetailModal(true);
  };

  const getSupplierName = (supplierId) => {
    if (!supplierId) return "-";
    const sup = suppliers.find(s => s.id === supplierId);
    return sup ? sup.name : "-";
  };

  // Filter by date
  const filterByDate = (items) => {
    const now = new Date();

    if (customStart && customEnd) {
      const start = new Date(customStart);
      const end = new Date(customEnd);
      end.setHours(23, 59, 59, 999);
      return items.filter((item) => {
        const itemDate = item.created_at ? new Date(item.created_at) : null;
        return itemDate && itemDate >= start && itemDate <= end;
      });
    }

    switch (dateFilter) {
      case "day":
        return items.filter((item) => {
          const itemDate = item.created_at ? new Date(item.created_at) : null;
          return itemDate &&
            itemDate.getDate() === now.getDate() &&
            itemDate.getMonth() === now.getMonth() &&
            itemDate.getFullYear() === now.getFullYear();
        });
      case "week": {
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        return items.filter((item) => {
          const itemDate = item.created_at ? new Date(item.created_at) : null;
          return itemDate && itemDate >= weekAgo;
        });
      }
      case "month":
        return items.filter((item) => {
          const itemDate = item.created_at ? new Date(item.created_at) : null;
          return itemDate &&
            itemDate.getMonth() === now.getMonth() &&
            itemDate.getFullYear() === now.getFullYear();
        });
      case "year":
        return items.filter((item) => {
          const itemDate = item.created_at ? new Date(item.created_at) : null;
          return itemDate && itemDate.getFullYear() === now.getFullYear();
        });
      default:
        return items;
    }
  };

  // Apply date filter then search filter
  const dateFiltered = filterByDate(inventory);
  const filteredData = dateFiltered.filter((item) =>
    item.item_name?.toLowerCase().includes(search.toLowerCase())
  );

  // Calculate totals - use latest price × current qty
  const totalItems = filteredData.length;
  const totalQty = filteredData.reduce((sum, item) => sum + (parseFloat(item.qty) || 0), 0);
  const totalValue = filteredData.reduce((sum, item) => {
    return sum + getTotalValueByQty(item.item_name, item.type || item.unit, item.qty, item.price);
  }, 0);

  // Pagination logic
  const indexOfLast = currentPage * rowsPerPage;
  const indexOfFirst = indexOfLast - rowsPerPage;
  const currentData = filteredData.slice(indexOfFirst, indexOfLast);
  const totalPages = Math.ceil(filteredData.length / rowsPerPage);

  // Export Excel
  const exportToExcel = () => {
    // Prepare export data with latest price × current qty
    const exportData = filteredData.map((item) => {
      const latestPrice = getEffectiveUnitPrice(item.item_name, item.type || item.unit, item.price);
      return {
        Item_Name: item.item_name,
        Quantity: item.qty,
        Unit: item.type,
        Price: latestPrice,
        Total_Value: getTotalValueByQty(item.item_name, item.type || item.unit, item.qty, item.price),
        Created_At: item.created_at ? new Date(item.created_at).toLocaleDateString() : "-",
      };
    });

    // Add summary row
    exportData.push({
      Item_Name: "TOTAL",
      Quantity: totalQty,
      Unit: "",
      Price: "",
      Total_Value: totalValue,
      Created_At: "",
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory Report");

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });

    const fileData = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    saveAs(fileData, "Inventory_Report.xlsx");
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventory Report</h1>
          <p className="text-sm text-slate-500 mt-1">View inventory report</p>
        </div>

        <button
          onClick={exportToExcel}
          className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
        >
          Export Excel
        </button>
      </div>

      {/* Search and Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap gap-3">
          {/* Date Filter */}
          <select
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setCustomStart("");
              setCustomEnd("");
              setCurrentPage(1);
            }}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Time</option>
            <option value="day">This Day</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
            <option value="custom">Custom Date</option>
          </select>

          {/* Custom Date Range */}
          {dateFilter === "custom" && (
            <>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="border px-3 py-2 rounded-lg"
              />
              <span className="text-slate-500 self-center">-</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="border px-3 py-2 rounded-lg"
              />
              <button
                onClick={() => setCurrentPage(1)}
                className="bg-blue-500 text-white px-4 py-2 rounded-lg"
              >
                Apply
              </button>
            </>
          )}

          {/* Search */}
          <input
            type="text"
            placeholder="Search item..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="px-4 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-slate-500">Total Items</p>
            <p className="text-xl font-bold text-slate-800">{totalItems}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Total Value</p>
            <p className="text-xl font-bold text-emerald-600">{formatMMK(totalValue)}</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Item Name</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Quantity</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Unit</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">Latest Price</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">Total Value</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="5" className="text-center py-6">
                  Loading...
                </td>
              </tr>
            ) : currentData.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center py-6">
                  No Data Found
                </td>
              </tr>
            ) : (
              currentData.map((item, index) => (
                <tr
                  key={index}
                  className="border-b border-slate-100 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition"
                >
                  {/* Item Name */}
                  <td className="px-4 py-3 font-medium text-gray-700 dark:text-slate-100">
                    <button
                      onClick={() => viewPurchaseHistory(item)}
                      className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200 underline"
                    >
                      {item.item_name}
                    </button>
                  </td>

                  {/* Quantity with Low Stock Hover */}
                  <td className="px-4 py-3 relative group">
                    {item.qty < 5 ? (
                      <>
                        <span className="bg-red-600 text-white px-3 py-1 rounded-full text-sm font-semibold cursor-pointer animate-pulse">
                          {item.qty}
                        </span>

                        <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-48 
                                        bg-red-600 text-white text-xs rounded-lg p-2 
                                        opacity-0 group-hover:opacity-100 
                                        transition duration-300 shadow-lg z-10">
                          ⚠ Critical Stock Level  
                          <br />
                          Only {item.qty} items remaining!
                        </div>
                      </>
                    ) : item.qty < 10 ? (
                      <>
                        <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-sm font-semibold cursor-pointer">
                          {item.qty}
                        </span>

                        <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-44 
                                        bg-red-500 text-white text-xs rounded-lg p-2 
                                        opacity-0 group-hover:opacity-100 
                                        transition duration-300 shadow-lg z-10">
                          ⚠ Low Stock Alert  
                          <br />
                          Only {item.qty} items remaining
                        </div>
                      </>
                    ) : (
                      <span className="bg-green-100 text-green-600 px-3 py-1 rounded-full text-sm font-semibold">
                        {item.qty}
                      </span>
                    )}
                  </td>

                  {/* Type */}
                  <td className="px-4 py-3 text-gray-600">
                    {item.type}
                  </td>

                  {/* Latest Price */}
                  <td className="px-4 py-3 text-right text-gray-600">
                    {formatMMK(getEffectiveUnitPrice(item.item_name, item.type || item.unit, item.price))}
                  </td>

                  {/* Total Value - latest price × current qty */}
                  <td className="px-4 py-3 text-right font-medium text-gray-700">
                    {formatMMK(getTotalValueByQty(item.item_name, item.type || item.unit, item.qty, item.price))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex justify-between items-center p-4 bg-gray-50">
          <span className="text-sm text-gray-600">
            Page {currentPage} of {totalPages || 1}
          </span>

          <div className="space-x-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
              className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300"
            >
              Prev
            </button>

            <button
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(currentPage + 1)}
              className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Purchase History Modal */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-3xl shadow-xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Purchase History</h3>
                <p className="text-sm text-slate-500">{selectedItem?.item_name}</p>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">X</button>
            </div>

            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">Type</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">Invoice #</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">Date</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">Supplier</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700 dark:text-slate-300">Qty</th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700 dark:text-slate-300">Unit Price</th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700 dark:text-slate-300">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseHistory.length > 0 ? (
                    purchaseHistory.map((item, idx) => {
                      const qty = parseFloat(item.qty) || 0;
                      const isZero = qty === 0;
                      const rowTotal =
                        toFiniteNumber(item.total_price) ||
                        ((parseFloat(item.qty) || 0) * (parseFloat(item.unit_price) || 0));
                      return (
                        <tr
                          key={idx}
                          className={`border-t border-slate-100 dark:border-slate-700 ${
                            isZero ? "bg-red-50 dark:bg-red-900/40" : ""
                          }`}
                        >
                          <td className="px-4 py-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              item.source_type === "Add Stock"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                            }`}>
                              {item.source_type || "Purchase"}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-slate-800 dark:text-slate-200 font-medium">{item.invoice_number}</td>
                          <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{item.purchase_date}</td>
                          <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{getSupplierName(item.supplier_id)}</td>
                          <td className="px-4 py-2 text-center text-slate-600 dark:text-slate-400">{item.qty}</td>
                          <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-400">{formatMMK(item.unit_price)}</td>
                          <td className="px-4 py-2 text-right font-medium text-slate-800 dark:text-slate-200">{formatMMK(rowTotal)}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">No stock history found</td>
                    </tr>
                  )}
                </tbody>
                {purchaseHistory.length > 0 && (
                  <tfoot className="bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                    <tr>
                      <td colSpan={5} className="px-4 py-2 text-right font-bold text-slate-800 dark:text-slate-200">Total</td>
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2 text-right font-bold text-indigo-600 dark:text-indigo-400">
                        {formatMMK(
                          purchaseHistory.reduce(
                            (sum, item) =>
                              sum +
                              (parseFloat(item.total_price) ||
                                ((parseFloat(item.qty) || 0) * (parseFloat(item.unit_price) || 0))),
                            0
                          )
                        )}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="flex justify-end mt-4">
              <button onClick={() => setShowDetailModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
