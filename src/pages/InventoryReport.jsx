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

  // Store latest prices and purchase totals
  const [latestPrices, setLatestPrices] = useState({});
  const [purchaseTotals, setPurchaseTotals] = useState({});

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

    const [invData, supData, purchaseItemsData] = await Promise.all([
      supabase.from("inventory").select("*").order("item_name", { ascending: true }),
      supabase.from("suppliers").select("id, name").order("name", { ascending: true }),
      receivedPurchaseIds.length > 0
        ? supabase.from("purchase_items").select("item_name, unit_price, total_price").in("purchase_id", receivedPurchaseIds).order("id", { ascending: false })
        : Promise.resolve({ data: [] })
    ]);

    if (!invData.error) setInventory(invData.data);
    if (!supData.error) setSuppliers(supData.data || []);

    // Get latest price and total purchased amount for each item
    if (purchaseItemsData.data) {
      const prices = {};
      const totals = {};
      purchaseItemsData.data.forEach(item => {
        const key = item.item_name?.toLowerCase().trim();
        if (key) {
          // Get latest price (first occurrence since ordered by id desc)
          if (!prices[key]) {
            prices[key] = item.unit_price;
          }
          // Accumulate total
          if (!totals[key]) totals[key] = 0;
          totals[key] += parseFloat(item.total_price) || 0;
        }
      });
      setLatestPrices(prices);
      setPurchaseTotals(totals);
    }

    setLoading(false);
  };

  // View purchase history for an item
  const viewPurchaseHistory = async (item) => {
    setSelectedItem(item);

    // Fetch purchase items for this item name (case insensitive)
    const { data: purchaseItems } = await supabase
      .from("purchase_items")
      .select("*")
      .ilike("item_name", item.item_name.trim());

    if (purchaseItems && purchaseItems.length > 0) {
      // Get unique purchase IDs
      const purchaseIds = [...new Set(purchaseItems.map(pi => pi.purchase_id))];

      // Fetch those purchases
      const { data: purchases } = await supabase
        .from("purchases")
        .select("*")
        .in("id", purchaseIds)
        .eq("status", "received")
        .order("date", { ascending: false });

      // Merge purchase data with purchase items
      const history = purchaseItems.map(pi => {
        const purchase = purchases?.find(p => p.id === pi.purchase_id);
        return {
          ...pi,
          purchase_date: purchase?.date || "-",
          invoice_number: purchase?.invoice_number || "-",
          supplier_id: purchase?.supplier_id,
          status: purchase?.status || "-"
        };
      });

      setPurchaseHistory(history);
    } else {
      setPurchaseHistory([]);
    }

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

  // Calculate totals - use purchase history totals
  const totalItems = filteredData.length;
  const totalQty = filteredData.reduce((sum, item) => sum + (parseFloat(item.qty) || 0), 0);
  const totalValue = filteredData.reduce((sum, item) => {
    const key = item.item_name?.toLowerCase().trim();
    if (key && purchaseTotals[key]) {
      return sum + purchaseTotals[key];
    }
    return sum + ((parseFloat(item.price) || 0) * (parseFloat(item.qty) || 0));
  }, 0);

  // Pagination logic
  const indexOfLast = currentPage * rowsPerPage;
  const indexOfFirst = indexOfLast - rowsPerPage;
  const currentData = filteredData.slice(indexOfFirst, indexOfLast);
  const totalPages = Math.ceil(filteredData.length / rowsPerPage);

  // Export Excel
  const exportToExcel = () => {
    // Prepare export data with calculated total value
    const exportData = filteredData.map((item) => ({
      Item_Name: item.item_name,
      Quantity: item.qty,
      Unit: item.type,
      Price: item.price,
      Total_Value: (parseFloat(item.price) || 0) * (parseFloat(item.qty) || 0),
      Created_At: item.created_at ? new Date(item.created_at).toLocaleDateString() : "-",
    }));

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
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-slate-500">Total Items</p>
            <p className="text-xl font-bold text-slate-800">{totalItems}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Total Quantity</p>
            <p className="text-xl font-bold text-indigo-600">{totalQty}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Total Value</p>
            <p className="text-xl font-bold text-emerald-600">{mmkFormatter.format(totalValue)}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <input
          type="text"
          placeholder="Search item..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
          className="w-full md:w-1/3 border border-slate-300 px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
        />
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
                  className="border-b border-slate-100 hover:bg-indigo-50/50 transition"
                >
                  {/* Item Name */}
                  <td className="px-4 py-3 font-medium text-gray-700">
                    <button
                      onClick={() => viewPurchaseHistory(item)}
                      className="text-indigo-600 hover:text-indigo-800 underline"
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
                    {latestPrices[item.item_name?.toLowerCase().trim()]
                      ? mmkFormatter.format(latestPrices[item.item_name?.toLowerCase().trim()])
                      : (item.price ? mmkFormatter.format(item.price) : "-")}
                  </td>

                  {/* Total Value - from purchase history */}
                  <td className="px-4 py-3 text-right font-medium text-gray-700">
                    {purchaseTotals[item.item_name?.toLowerCase().trim()]
                      ? mmkFormatter.format(purchaseTotals[item.item_name?.toLowerCase().trim()])
                      : mmkFormatter.format((parseFloat(item.price) || 0) * (parseFloat(item.qty) || 0))}
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

            <div className="border border-slate-200 rounded-lg overflow-hidden flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Invoice #</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Date</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Supplier</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Qty</th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700">Unit Price</th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseHistory.length > 0 ? (
                    purchaseHistory.map((item, idx) => (
                      <tr key={idx} className="border-t border-slate-100">
                        <td className="px-4 py-2 text-slate-800 font-medium">{item.invoice_number}</td>
                        <td className="px-4 py-2 text-slate-600">{item.purchase_date}</td>
                        <td className="px-4 py-2 text-slate-600">{getSupplierName(item.supplier_id)}</td>
                        <td className="px-4 py-2 text-center text-slate-600">{item.qty}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{mmkFormatter.format(item.unit_price)}</td>
                        <td className="px-4 py-2 text-right font-medium text-slate-800">{mmkFormatter.format(item.total_price)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No purchase history found</td>
                    </tr>
                  )}
                </tbody>
                {purchaseHistory.length > 0 && (
                  <tfoot className="bg-slate-50">
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right font-bold text-slate-800">Total</td>
                      <td className="px-4 py-2 text-center font-bold text-slate-800">
                        {purchaseHistory.reduce((sum, item) => sum + (parseFloat(item.qty) || 0), 0)}
                      </td>
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2 text-right font-bold text-indigo-600">
                        {mmkFormatter.format(purchaseHistory.reduce((sum, item) => sum + (parseFloat(item.total_price) || 0), 0))}
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
