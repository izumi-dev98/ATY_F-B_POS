import { useEffect, useState } from "react";
import supabase from "../createClients";
import Swal from "sweetalert2";
import { buildFifoList, deductFromFifo } from "../utils/fifoService";

export default function History({ setInventory }) {
  const [history, setHistory] = useState([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [ingredientsMap, setIngredientsMap] = useState({});
  const [dateFilter, setDateFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [fifoHistory, setFifoHistory] = useState({});
  const ordersPerPage = 8;

  const mmkFormatter = new Intl.NumberFormat("en-MM", {
    style: "currency",
    currency: "MMK",
    maximumFractionDigits: 0,
  });

  // Get date range based on filter type
  const getDateRange = () => {
    const now = new Date();
    let start = null;
    let end = new Date(now);

    switch (dateFilter) {
      case "day":
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "week":
        start = new Date(now);
        start.setDate(now.getDate() - 7);
        break;
      case "month":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "year":
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case "custom":
        if (startDate && endDate) {
          start = new Date(startDate);
          end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
        }
        break;
      default:
        return null;
    }
    return start ? { start, end } : null;
  };

  // Filter history by date
  const filteredByDate = (orders) => {
    const range = getDateRange();
    if (!range) return orders;

    return orders.filter((order) => {
      const orderDate = new Date(order.created_at);
      return orderDate >= range.start && orderDate <= range.end;
    });
  };

  // Fetch all orders, items, and menu
  const fetchHistory = async () => {
    try {
      const { data: orders, error: ordersErr } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (ordersErr) throw ordersErr;

      const { data: orderItems, error: itemsErr } = await supabase
        .from("order_items")
        .select("*")
        .order("id", { ascending: true });
      if (itemsErr) throw itemsErr;

      const { data: menuData, error: menuErr } = await supabase
        .from("menu")
        .select("*");
      if (menuErr) throw menuErr;

      const { data: menuSetsData, error: setsErr } = await supabase
        .from("menu_sets")
        .select("*");
      if (setsErr) throw setsErr;

      const { data: menuSetItemsData, error: setItemsErr } = await supabase
        .from("menu_set_items")
        .select("*");
      if (setItemsErr) throw setItemsErr;

      const { data: ingData, error: ingErr } = await supabase.from("menu_ingredients").select("*");
      if (ingErr) throw ingErr;

      // Build ingredients map
      const ingMap = {};
      ingData.forEach((ing) => {
        if (!ingMap[ing.menu_id]) ingMap[ing.menu_id] = [];
        ingMap[ing.menu_id].push(ing);
      });
      setIngredientsMap(ingMap);

      // Build menu set items map
      const setItemsMap = {};
      menuSetItemsData.forEach((item) => {
        if (!setItemsMap[item.set_id]) setItemsMap[item.set_id] = [];
        setItemsMap[item.set_id].push(item);
      });

      // Merge menu names
      const historyData = orders.map((order) => {
        const items = orderItems
          .filter((i) => i.order_id === order.id)
          .map((i) => {
            if (i.menu_set_id) {
              const menuSet = menuSetsData.find((s) => s.id === i.menu_set_id);
              return {
                ...i,
                menu_name: menuSet?.set_name || "Unknown Set",
                isSet: true,
                setItems: setItemsMap[i.menu_set_id] || [],
              };
            } else {
              return {
                ...i,
                menu_name: menuData.find((m) => m.id === i.menu_id)?.menu_name || "Unknown Menu",
                isSet: false,
              };
            }
          });
        return { ...order, items };
      });

      setHistory(historyData);
    } catch (err) {
      console.error(err);
      Swal.fire("Error", err.message || "Failed to fetch history", "error");
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  // Filtered history based on search and date
  const filteredHistory = filteredByDate(history).filter((order) => {
    const searchLower = search.toLowerCase();
    const matchOrderId = order.id.toString().includes(searchLower);
    const matchMenuItem = order.items.some((item) =>
      item.menu_name.toLowerCase().includes(searchLower)
    );
    return matchOrderId || matchMenuItem;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredHistory.length / ordersPerPage);
  const paginatedHistory = filteredHistory.slice(
    (page - 1) * ordersPerPage,
    page * ordersPerPage
  );

  // Print receipt
  const printReceipt = (order) => {
    const date = new Date(order.created_at).toLocaleString();
    const statusLabel = order.status === 'pending' ? 'PENDING' : order.status === 'completed' ? 'COMPLETED' : 'CANCELLED';
    const subtotal = order.subtotal || 0;
    const discountPercent = order.discount_percent || 0;
    const discountAmount = order.discount_amount || 0;
    const taxPercent = order.tax_percent || 0;
    const taxAmount = order.tax_amount || 0;
    const receiptContent = `
      <html>
        <head><title>Order #${order.id}</title></head>
        <body style="font-family: monospace; width: 300px; padding: 10px;">
          <h1 style="text-align:center;">F&B ATY SLIP</h1>
          <p>Slip ID: ${order.id}</p>
          <p>Date: ${date}</p>
          <p>Status: ${statusLabel}</p>
          <table style="width:100%; border-collapse: collapse;">
            <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
            <tbody>
              ${order.items.map(i => `<tr>
                <td>${i.menu_name}${i.isSet ? ' (Set)' : ''}</td>
                <td>${i.qty}</td>
                <td>${mmkFormatter.format(i.price)}</td>
                <td>${mmkFormatter.format(i.price * i.qty)}</td>
              </tr>`).join("")}
            </tbody>
          </table>
          <hr/>
          <div style="text-align:right;">
            <p>Subtotal: ${mmkFormatter.format(subtotal)}</p>
            ${discountAmount > 0 ? `<p style="color:black;">Discount (${discountPercent}%): -${mmkFormatter.format(discountAmount)}</p>` : ''}
            ${taxAmount > 0 ? `<p style="color:black;">Tax (${taxPercent}%): +${mmkFormatter.format(taxAmount)}</p>` : ''}
            <p style="font-weight:bold; font-size:1.2em;">Total: ${mmkFormatter.format(order.total)}</p>
          </div>
          <p style="text-align:center;">Thank you!</p>
        </body>
      </html>
    `;
    const iframe = document.createElement("iframe");
    iframe.style.position = "absolute";
    iframe.style.width = "0";
    iframe.style.height = "0";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(receiptContent);
    doc.close();
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    document.body.removeChild(iframe);
  };

  // Complete order - deduct inventory + purchase history (FIFO), then set status
  const handleComplete = async (order) => {
    try {
      const { data: inventoryData, error: inventoryErr } = await supabase
        .from("inventory")
        .select("*");
      if (inventoryErr) throw inventoryErr;

      const updatedInventory = (inventoryData || []).map((i) => ({ ...i }));

      // Build required ingredient qty per inventory item for this order
      const neededByInventoryId = {};
      for (const item of order.items) {
        if (item.isSet) {
          for (const setItem of item.setItems || []) {
            const ingredients = ingredientsMap[setItem.menu_id] || [];
            for (const ing of ingredients) {
              const need = (parseFloat(ing.qty) || 0) * (parseFloat(item.qty) || 0);
              neededByInventoryId[ing.inventory_id] = (neededByInventoryId[ing.inventory_id] || 0) + need;
            }
          }
        } else {
          const ingredients = ingredientsMap[item.menu_id] || [];
          for (const ing of ingredients) {
            const need = (parseFloat(ing.qty) || 0) * (parseFloat(item.qty) || 0);
            neededByInventoryId[ing.inventory_id] = (neededByInventoryId[ing.inventory_id] || 0) + need;
          }
        }
      }

      // Allow negative inventory - no validation
      // for (const [inventoryId, neededQty] of Object.entries(neededByInventoryId)) {
      //   const inv = updatedInventory.find((i) => i.id === Number(inventoryId));
      //   if (!inv || (parseFloat(inv.qty) || 0) < neededQty) {
      //     throw new Error(`Not enough stock for ${inv?.item_name || `Inventory ID ${inventoryId}`}`);
      //   }
      // }

      // FIFO deduction from stock history (Purchase + Add Stock) by created_at
      const deductFromStockHistory = async (inventoryId, _itemName, _itemType, qtyToDeduct) => {
        const getFifoTimestamp = (value) => {
          if (!value) return Number.POSITIVE_INFINITY;
          let ts = new Date(value).getTime();
          if (Number.isNaN(ts)) return Number.POSITIVE_INFINITY;
          return ts;
        };

        // Fetch all received purchases with created_at for accurate FIFO
        const { data: purchases, error: purchasesErr } = await supabase
          .from("purchases")
          .select("id, date, created_at")
          .eq("status", "received");

        if (purchasesErr) throw purchasesErr;
        const purchaseIds = (purchases || []).map((p) => p.id);

        // Fetch all add_stock records
        const { data: addStockRecords, error: addStockErr } = await supabase
          .from("internal_consumption")
          .select("id, created_at")
          .eq("status", "add_stock");

        if (addStockErr) throw addStockErr;
        const addStockIds = (addStockRecords || []).map((r) => r.id);

        // Build combined FIFO list
        const fifoList = [];

        // Fetch inventory for matching
        const { data: allInventory, error: invErr } = await supabase
          .from("inventory")
          .select("id, item_name, type");

        if (invErr) throw invErr;
        const targetInv = allInventory.find(inv => inv.id === inventoryId);

        if (targetInv) {
          const normalizeName = (value) => value?.toString().trim().toLowerCase() || "";
          const normalizeType = (value) => {
            const normalized = value?.toString().trim().toLowerCase();
            return normalized || "-";
          };
          const targetName = normalizeName(targetInv.item_name);
          const targetType = normalizeType(targetInv.type);

          // Add purchase items
          if (purchaseIds.length > 0) {
            const { data: purchaseItems, error: itemsErr } = await supabase
              .from("purchase_items")
              .select("id, qty, unit_price, purchase_id, item_name, type")
              .in("purchase_id", purchaseIds);

            if (itemsErr) throw itemsErr;
            if (purchaseItems) {
              const exactMatches = purchaseItems.filter((pi) =>
                normalizeName(pi.item_name) === targetName &&
                normalizeType(pi.type) === targetType
              );
              const matchedPurchaseItems = exactMatches.length > 0
                ? exactMatches
                : purchaseItems.filter((pi) => normalizeName(pi.item_name) === targetName);

              matchedPurchaseItems.forEach(pi => {
                const purchase = purchases?.find(p => p.id === pi.purchase_id);
                // Use created_at for FIFO (more accurate than date only)
                const fifoDate = purchase?.created_at || purchase?.date;
                fifoList.push({
                  id: pi.id,
                  qty: parseFloat(pi.qty) || 0,
                  unit_price: parseFloat(pi.unit_price) || 0,
                  date: fifoDate,
                  fifoTimestamp: getFifoTimestamp(fifoDate),
                  source: "purchase"
                });
              });
            }
          }

          // Add add_stock items
          if (addStockIds.length > 0) {
            const { data: addStockItems, error: itemsErr } = await supabase
              .from("internal_consumption_items")
              .select("id, qty, unit_price, consumption_id, inventory_id")
              .in("consumption_id", addStockIds);

            if (itemsErr) throw itemsErr;
            if (addStockItems) {
              addStockItems.forEach(ai => {
                if (ai.inventory_id === inventoryId) {
                  const addStock = addStockRecords?.find(r => r.id === ai.consumption_id);
                  fifoList.push({
                    id: ai.id,
                    qty: parseFloat(ai.qty) || 0,
                    unit_price: parseFloat(ai.unit_price) || 0,
                    date: addStock?.created_at || null,
                    fifoTimestamp: getFifoTimestamp(addStock?.created_at),
                    source: "add_stock"
                  });
                }
              });
            }
          }
        }

        // True FIFO across sources by created_at:
        // 1) oldest created_at first
        // 2) stable numeric id as final tie-breaker
        fifoList.sort((a, b) => {
          if (a.fifoTimestamp !== b.fifoTimestamp) return a.fifoTimestamp - b.fifoTimestamp;
          return (Number(a.id) || 0) - (Number(b.id) || 0);
        });

        // Deduct using FIFO (keeping inline for critical order completion logic)
        let remaining = qtyToDeduct;
        for (const row of fifoList) {
          if (remaining <= 0) break;

          const currentQty = row.qty;
          const unitPrice = row.unit_price;
          if (currentQty <= 0) continue;

          const consumeQty = Math.min(currentQty, remaining);
          const newQty = currentQty - consumeQty;

          // Update the appropriate table
          if (row.source === "purchase") {
            const { error: updateErr } = await supabase
              .from("purchase_items")
              .update({
                qty: newQty,
                total_price: newQty * unitPrice,
              })
              .eq("id", row.id);

            if (updateErr) throw updateErr;
          } else if (row.source === "add_stock") {
            const { error: updateErr } = await supabase
              .from("internal_consumption_items")
              .update({
                qty: newQty,
              })
              .eq("id", row.id);

            if (updateErr) throw updateErr;
          }

          remaining -= consumeQty;
        }

        return remaining;
      };

      const purchaseHistoryWarnings = [];

      // Deduct inventory + purchase history
      for (const [inventoryId, neededQty] of Object.entries(neededByInventoryId)) {
        const inv = updatedInventory.find((i) => i.id === Number(inventoryId));
        const currentQty = parseFloat(inv?.qty) || 0;
        const newQty = currentQty - neededQty;

        const { error: invUpdateErr } = await supabase
          .from("inventory")
          .update({ qty: newQty })
          .eq("id", Number(inventoryId));
        if (invUpdateErr) throw invUpdateErr;

        if (inv) inv.qty = newQty;

        const remaining = await deductFromStockHistory(
          Number(inventoryId),
          inv?.item_name,
          inv?.type || inv?.unit,
          neededQty,
        );
        if (remaining > 0) {
          purchaseHistoryWarnings.push(`${inv?.item_name || inventoryId} (remaining ${remaining})`);
        }
      }

      const { error: statusErr } = await supabase
        .from("orders")
        .update({ status: "completed" })
        .eq("id", order.id);
      if (statusErr) throw statusErr;

      if (setInventory) setInventory(updatedInventory);

      if (purchaseHistoryWarnings.length > 0) {
        Swal.fire(
          "Completed with warning",
          `Order completed. Purchase history was not enough for: ${purchaseHistoryWarnings.join(", ")}`,
          "warning",
        );
      } else {
        Swal.fire("Success", "Order marked as completed and inventory deducted!", "success");
      }
      fetchHistory();
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to complete order", "error");
    }
  };

  // Fetch FIFO history for inventory item
  const fetchFifoHistory = async (inventoryId) => {
    try {
      const { data: purchases } = await supabase
        .from("purchases")
        .select("id, date, created_at")
        .eq("status", "received");

      const purchaseIds = purchases?.map(p => p.id) || [];

      const { data: addStockRecords } = await supabase
        .from("internal_consumption")
        .select("id, created_at")
        .eq("status", "add_stock");

      const addStockIds = addStockRecords?.map(r => r.id) || [];

      const { data: allInventory } = await supabase
        .from("inventory")
        .select("id, item_name, type");

      const targetInv = allInventory?.find(inv => inv.id === inventoryId);
      const fifoList = [];

      if (targetInv) {
        const normalizeName = (value) => value?.toString().trim().toLowerCase() || "";
        const normalizeType = (value) => value?.toString().trim().toLowerCase() || "-";
        const targetName = normalizeName(targetInv.item_name);
        const targetType = normalizeType(targetInv.type);

        if (purchaseIds.length > 0) {
          const { data: purchaseItems } = await supabase
            .from("purchase_items")
            .select("id, qty, unit_price, purchase_id, item_name, type")
            .in("purchase_id", purchaseIds);

          if (purchaseItems) {
            const exactMatches = purchaseItems.filter((pi) =>
              normalizeName(pi.item_name) === targetName && normalizeType(pi.type) === targetType
            );
            const matchedPurchaseItems = exactMatches.length > 0 ? exactMatches : purchaseItems.filter((pi) => normalizeName(pi.item_name) === targetName);

            matchedPurchaseItems.forEach(pi => {
              const purchase = purchases?.find(p => p.id === pi.purchase_id);
              const fifoDate = purchase?.created_at || purchase?.date;
              fifoList.push({
                id: pi.id,
                qty: parseFloat(pi.qty) || 0,
                date: fifoDate,
                source: "purchase",
                item_name: pi.item_name
              });
            });
          }
        }

        if (addStockIds.length > 0) {
          const { data: addStockItems } = await supabase
            .from("internal_consumption_items")
            .select("id, qty, unit_price, consumption_id, inventory_id")
            .in("consumption_id", addStockIds);

          if (addStockItems) {
            addStockItems.forEach(ai => {
              if (ai.inventory_id === inventoryId) {
                const addStock = addStockRecords?.find(r => r.id === ai.consumption_id);
                fifoList.push({
                  id: ai.id,
                  qty: parseFloat(ai.qty) || 0,
                  date: addStock?.created_at || null,
                  source: "add_stock",
                  item_name: targetInv.item_name
                });
              }
            });
          }
        }
      }

      // Sort by FIFO (oldest first)
      fifoList.sort((a, b) => {
        const aTime = a.date ? new Date(a.date).getTime() : Infinity;
        const bTime = b.date ? new Date(b.date).getTime() : Infinity;
        if (aTime !== bTime) return aTime - bTime;
        return (Number(a.id) || 0) - (Number(b.id) || 0);
      });

      return fifoList;
    } catch (err) {
      console.error("Error fetching FIFO history:", err);
      return [];
    }
  };

  const toggleOrderDetails = async (order) => {
    if (expandedOrder === order.id) {
      setExpandedOrder(null);
    } else {
      setExpandedOrder(order.id);
      // Fetch FIFO history for all ingredients in this order
      const historyMap = {};
      const neededByInventoryId = {};

      for (const item of order.items) {
        if (item.isSet) {
          for (const setItem of item.setItems || []) {
            const ingredients = ingredientsMap[setItem.menu_id] || [];
            for (const ing of ingredients) {
              neededByInventoryId[ing.inventory_id] = true;
            }
          }
        } else {
          const ingredients = ingredientsMap[item.menu_id] || [];
          for (const ing of ingredients) {
            neededByInventoryId[ing.inventory_id] = true;
          }
        }
      }

      for (const invId of Object.keys(neededByInventoryId)) {
        historyMap[invId] = await fetchFifoHistory(Number(invId));
      }
      setFifoHistory(historyMap);
    }
  };

  // Cancel pending order only (no stock return because deduction happens on complete)
  const handleCancel = async (order) => {
    const result = await Swal.fire({
      title: "Cancel Order?",
      text: "This will cancel this pending order.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Cancel",
      cancelButtonText: "No"
    });

    if (!result.isConfirmed) return;

    try {
      // Update order status to cancelled
      await supabase.from("orders").update({ status: "cancelled" }).eq("id", order.id);
      Swal.fire("Cancelled", "Order cancelled successfully!", "success");
      fetchHistory();
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to cancel order", "error");
    }
  };

  // Get status badge color
  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending' };
      case 'completed':
        return { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' };
      case 'cancelled':
        return { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelled' };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-800', label: status };
    }
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Order History</h1>
        <p className="text-sm text-slate-500 mt-1">View all order records</p>
      </div>

      {/* Search and Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap gap-3">
        {/* Date Filter */}
        <select
          value={dateFilter}
          onChange={(e) => {
            setDateFilter(e.target.value);
            setPage(1);
          }}
          className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All Time</option>
          <option value="day">Today</option>
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
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="self-center text-slate-500">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </>
        )}

        {/* Search Input */}
        <input
          type="text"
          placeholder="Search by Order ID or Item Name..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="px-4 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        </div>
      </div>

      {filteredHistory.length === 0 ? (
        <p className="text-gray-400 text-center mt-20">No orders found</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedHistory.map((order , index) => {
              const statusBadge = getStatusBadge(order.status);
              const subtotal = order.items.reduce((s, i) => s + ((i.original_price != null ? i.original_price : i.price) * i.qty), 0);
              const manualDiscount = order.items.reduce((s, i) => {
                if (i.original_price != null && i.original_price > i.price) {
                  return s + (i.original_price - i.price) * i.qty;
                }
                return s;
              }, 0);
              const orderDiscount = order.discount_amount || 0;
              const taxAmount = order.tax_amount || 0;
              return (
                <div key={index} className="bg-white rounded-2xl shadow-lg p-6 flex flex-col justify-between">
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2 cursor-pointer" onClick={() => toggleOrderDetails(order)}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">Order #{index + 1}</span>
                        <span className="text-2xl text-gray-400">
                          {expandedOrder === order.id ? "−" : "+"}
                        </span>
                      </div>
                      <span className=" text-sm">Slip :{order.id}</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusBadge.bg} ${statusBadge.text}`}>
                        {statusBadge.label}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {new Date(order.created_at).toLocaleDateString()}<br/>
                      {new Date(order.created_at).toLocaleTimeString()}
                    </span>

                    <ul className="border-t border-b py-2 text-sm max-h-48 overflow-y-auto">
                      {order.items.map((item, idx) => {
                        const origTotal = item.original_price != null ? item.original_price * item.qty : item.price * item.qty;
                        const itemDisc = item.original_price != null ? (item.original_price - item.price) * item.qty : 0;
                        return (
                        <li key={idx} className="flex justify-between py-1 border-b last:border-b-0">
                          <span>
                            {item.menu_name}
                            {item.isSet && <span className="ml-1 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">SET</span>}
                            {' × '}{item.qty}
                            {itemDisc > 0 && <span className="ml-1 text-xs text-red-500">(-{mmkFormatter.format(itemDisc)})</span>}
                          </span>
                          <span>{mmkFormatter.format(origTotal)}</span>
                        </li>
                        );
                      })}
                    </ul>

                    {/* Expanded FIFO History Section */}
                    {expandedOrder === order.id && (
                      <div className="mt-4 border-t pt-4">
                        <h4 className="font-semibold text-sm text-slate-700 mb-2">FIFO Stock Consumption History</h4>
                        <div className="max-h-60 overflow-y-auto">
                          {(() => {
                            const allFifoRows = [];
                            Object.keys(fifoHistory[order.id] || {}).forEach((invId) => {
                              const rows = fifoHistory[order.id][invId] || [];
                              rows.forEach((row, rowIdx) => {
                                const isZeroQty = row.qty === 0;
                                allFifoRows.push(
                                  <tr key={`${invId}-${rowIdx}`} className={`${isZeroQty ? "bg-red-50 dark:bg-red-900/20" : ""}`}>
                                    <td className="py-2">{row.item_name || `Item ${invId}`}</td>
                                    <td className="py-2 capitalize">{row.source}</td>
                                    <td className="py-2">{row.date ? new Date(row.date).toLocaleDateString() : "-"}</td>
                                    <td className={`py-2 font-medium ${isZeroQty ? "text-red-600" : ""}`}>{row.qty}</td>
                                    <td className="py-2">
                                      {isZeroQty ? (
                                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Depleted</span>
                                      ) : (
                                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">In Stock</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              });
                            });
                            return allFifoRows.length > 0 ? (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b">
                                    <th className="pb-2 text-left">Item</th>
                                    <th className="pb-2 text-left">Source</th>
                                    <th className="pb-2 text-left">Date</th>
                                    <th className="pb-2 text-left">Remaining Qty</th>
                                    <th className="pb-2 text-left">Status</th>
                                  </tr>
                                </thead>
                                <tbody>{allFifoRows}</tbody>
                              </table>
                            ) : (
                              <p className="text-gray-500 text-center py-4">No FIFO history available</p>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Price Breakdown */}
                    <div className="mt-2 text-sm">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>{mmkFormatter.format(subtotal)}</span>
                      </div>
                      {manualDiscount > 0 && (
                        <div className="flex justify-between text-red-500">
                          <span>Manual Discount:</span>
                          <span>-{mmkFormatter.format(manualDiscount)}</span>
                        </div>
                      )}
                      {orderDiscount > 0 && (
                        <div className="flex justify-between text-red-500">
                          <span>Discount ({order.discount_percent}%){order.discount_type ? ` ${order.discount_type}` : ''}:</span>
                          <span>-{mmkFormatter.format(orderDiscount)}</span>
                        </div>
                      )}
                      {taxAmount > 0 && (
                        <div className="flex justify-between text-blue-500">
                          <span>Tax:</span>
                          <span>+{mmkFormatter.format(taxAmount)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center mt-4">
                    <span className="font-bold text-lg">Total: {mmkFormatter.format(order.total)}</span>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => printReceipt(order)}
                      className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-xl hover:bg-blue-700 transition"
                    >
                      Print
                    </button>
                    {order.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleComplete(order)}
                          className="flex-1 bg-green-600 text-white px-3 py-2 rounded-xl hover:bg-green-700 transition"
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => handleCancel(order)}
                          className="flex-1 bg-red-500 text-white px-3 py-2 rounded-xl hover:bg-red-600 transition"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex justify-center items-center gap-3 mt-8">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="px-3 py-1 rounded-lg bg-gray-200 hover:bg-gray-300 transition"
              disabled={page === 1}
            >
              Prev
            </button>

            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i + 1}
                onClick={() => setPage(i + 1)}
                className={`px-3 py-1 rounded-lg transition ${
                  page === i + 1 ? "bg-blue-600 text-white" : "bg-gray-200 hover:bg-gray-300"
                }`}
              >
                {i + 1}
              </button>
            ))}

            <button
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              className="px-3 py-1 rounded-lg bg-gray-200 hover:bg-gray-300 transition"
              disabled={page === totalPages}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
