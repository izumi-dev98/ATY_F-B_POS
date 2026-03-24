import { useEffect, useState } from "react";
import supabase from "../createClients";
import Swal from "sweetalert2";

export default function History({ setInventory }) {
  const [history, setHistory] = useState([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [ingredientsMap, setIngredientsMap] = useState({});
  const [dateFilter, setDateFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
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

      const { data: purchases, error: purchasesErr } = await supabase
        .from("purchases")
        .select("id")
        .eq("status", "received")
        .order("id", { ascending: true });
      if (purchasesErr) throw purchasesErr;

      const receivedPurchaseIds = (purchases || []).map((p) => p.id);
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

      // Validate stock before update
      for (const [inventoryId, neededQty] of Object.entries(neededByInventoryId)) {
        const inv = updatedInventory.find((i) => i.id === Number(inventoryId));
        if (!inv || (parseFloat(inv.qty) || 0) < neededQty) {
          throw new Error(`Not enough stock for ${inv?.item_name || `Inventory ID ${inventoryId}`}`);
        }
      }

      // FIFO deduction from purchase_items for same item name
      const deductFromPurchaseHistory = async (itemName, qtyToDeduct) => {
        const normalizedName = itemName?.trim();
        if (!normalizedName || qtyToDeduct <= 0) return qtyToDeduct;
        if (receivedPurchaseIds.length === 0) return qtyToDeduct;

        const { data: purchaseItems, error: purchaseItemsErr } = await supabase
          .from("purchase_items")
          .select("id, qty, unit_price")
          .eq("item_name", normalizedName)
          .in("purchase_id", receivedPurchaseIds)
          .order("id", { ascending: true });
        if (purchaseItemsErr) throw purchaseItemsErr;

        let remaining = qtyToDeduct;
        for (const row of purchaseItems || []) {
          if (remaining <= 0) break;

          const currentQty = parseFloat(row.qty) || 0;
          const unitPrice = parseFloat(row.unit_price) || 0;
          if (currentQty <= 0) continue;

          const usedQty = Math.min(currentQty, remaining);
          const newQty = currentQty - usedQty;

          const { error: updateErr } = await supabase
            .from("purchase_items")
            .update({ qty: newQty, total_price: newQty * unitPrice })
            .eq("id", row.id);
          if (updateErr) throw updateErr;

          remaining -= usedQty;
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

        const remaining = await deductFromPurchaseHistory(inv?.item_name, neededQty);
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
              const subtotal = order.subtotal || 0;
              const discountAmount = order.discount_amount || 0;
              const taxAmount = order.tax_amount || 0;
              return (
                <div key={index} className="bg-white rounded-2xl shadow-lg p-6 flex flex-col justify-between">
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm">Order #{index + 1}</span>
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
                      {order.items.map((item, idx) => (
                        <li key={idx} className="flex justify-between py-1 border-b last:border-b-0">
                          <span>
                            {item.menu_name}
                            {item.isSet && <span className="ml-1 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">SET</span>}
                            {' × '}{item.qty}
                          </span>
                          <span>{mmkFormatter.format(item.price * item.qty)}</span>
                        </li>
                      ))}
                    </ul>

                    {/* Price Breakdown */}
                    <div className="mt-2 text-sm">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>{mmkFormatter.format(subtotal)}</span>
                      </div>
                      {discountAmount > 0 && (
                        <div className="flex justify-between text-red-500">
                          <span>Discount:</span>
                          <span>-{mmkFormatter.format(discountAmount)}</span>
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
