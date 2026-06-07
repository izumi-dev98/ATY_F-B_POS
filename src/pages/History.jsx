import { useEffect, useState } from "react";
import supabase from "../createClients";
import Swal from "sweetalert2";

export default function History({ setInventory }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [ingredientsMap, setIngredientsMap] = useState({});
  const [dateFilter, setDateFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const ordersPerPage = 9;

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
    setLoading(true);
    try {
      const { data: orders, error: ordersErr } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (ordersErr) throw ordersErr;

      if (!orders || orders.length === 0) {
        setHistory([]);
        setLoading(false);
        return;
      }

      // Chunk order IDs
      const orderIds = orders.map(o => o.id);
      const chunkSize = 100;
      let allOrderItems = [];
      
      for (let i = 0; i < orderIds.length; i += chunkSize) {
        const chunk = orderIds.slice(i, i + chunkSize);
        const { data: itemChunk, error: itemsErr } = await supabase
          .from("order_items")
          .select("*")
          .in("order_id", chunk);
        
        if (itemsErr) throw itemsErr;
        allOrderItems = [...allOrderItems, ...itemChunk];
      }

      const { data: menuData } = await supabase.from("menu").select("*");
      const { data: ingData } = await supabase.from("menu_ingredients").select("*");

      // Build ingredients map
      const ingMap = {};
      (ingData || []).forEach((ing) => {
        if (!ingMap[ing.menu_id]) ingMap[ing.menu_id] = [];
        ingMap[ing.menu_id].push(ing);
      });
      setIngredientsMap(ingMap);

      // Merge menu names
      const historyData = orders.map((order) => {
        const items = allOrderItems
          .filter((i) => String(i.order_id) === String(order.id))
          .map((i) => ({
            ...i,
            menu_name: menuData?.find((m) => String(m.id) === String(i.menu_id))?.menu_name || "Unknown Menu",
          }));
        return { ...order, items };
      });

      setHistory(historyData);
    } catch (err) {
      console.error(err);
      Swal.fire("Error", err.message || "Failed to fetch history", "error");
    } finally {
      setLoading(false);
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
                <td>${i.menu_name}</td>
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

  const handleComplete = async (order) => {
    try {
      await supabase.from("orders").update({ status: "completed" }).eq("id", order.id);
      Swal.fire("Success", "Order marked as completed!", "success");
      fetchHistory();
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to complete order", "error");
    }
  };

  const handleCancel = async (order) => {
    const result = await Swal.fire({
      title: "Cancel Order?",
      text: "This will return items to inventory and remove from sales.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Cancel",
      cancelButtonColor: "#d33",
      confirmButtonColor: "#3085d6",
    });

    if (!result.isConfirmed) return;

    try {
      const { data: inventoryData } = await supabase.from("inventory").select("*");
      const updatedInventory = [...inventoryData];

      for (const item of order.items) {
        const ingredients = ingredientsMap[item.menu_id] || [];
        for (const ing of ingredients) {
          const inv = updatedInventory.find((i) => i.id === ing.inventory_id);
          if (inv) {
            const newQty = inv.qty + ing.qty * item.qty;
            await supabase.from("inventory").update({ qty: newQty }).eq("id", ing.inventory_id);
            inv.qty = newQty;
          }
        }
      }

      await supabase.from("orders").update({ status: "cancelled" }).eq("id", order.id);
      if (setInventory) setInventory(updatedInventory);

      Swal.fire("Cancelled", "Order cancelled and inventory returned!", "success");
      fetchHistory();
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to cancel order", "error");
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', label: 'Pending' };
      case 'completed':
        return { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Completed' };
      case 'cancelled':
        return { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200', label: 'Cancelled' };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200', label: status };
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header Section */}
      <div className="bg-white border-b px-6 py-8 mb-8 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Order History</h1>
            <p className="text-gray-500 mt-1">View and manage all your past orders</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Date Filter */}
            <div className="relative">
              <select
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setPage(1);
                }}
                className="pl-3 pr-8 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
              >
                <option value="all">All Time</option>
                <option value="day">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="year">This Year</option>
                <option value="custom">Custom Range</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 md:flex-none md:w-64">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search orders..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm w-full focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Custom Date Inputs */}
        {dateFilter === "custom" && (
          <div className="max-w-7xl mx-auto mt-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto px-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-500 font-medium">Loading history...</p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 py-20 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 text-gray-400 mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">No orders found</h3>
            <p className="text-gray-500 max-w-xs mx-auto mt-2">Try adjusting your filters or search terms to find what you're looking for.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedHistory.map((order) => {
                const statusBadge = getStatusBadge(order.status);
                const subtotal = order.subtotal || 0;
                const discountAmount = order.discount_amount || 0;
                const taxAmount = order.tax_amount || 0;
                
                return (
                  <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col hover:shadow-md transition-shadow duration-300">
                    {/* Card Header */}
                    <div className="px-5 py-4 border-b bg-gray-50/50 flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Order</span>
                          <span className="text-sm font-semibold text-gray-900">#{order.id}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {new Date(order.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} • {new Date(order.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusBadge.bg} ${statusBadge.text} ${statusBadge.border}`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${statusBadge.text.replace('text', 'bg')}`}></span>
                        {statusBadge.label}
                      </span>
                    </div>

                    {/* Card Body */}
                    <div className="px-5 py-4 flex-1">
                      <div className="space-y-3">
                        <div className="max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center text-sm py-1.5 border-b border-gray-50 last:border-0">
                              <div className="flex items-center gap-2">
                                <span className="bg-gray-100 text-gray-600 w-6 h-6 flex items-center justify-center rounded text-xs font-bold">{item.qty}x</span>
                                <span className="text-gray-700">{item.menu_name}</span>
                              </div>
                              <span className="text-gray-900 font-medium">{mmkFormatter.format(item.price * item.qty)}</span>
                            </div>
                          ))}
                        </div>

                        {/* Totals */}
                        <div className="pt-3 border-t space-y-1.5">
                          <div className="flex justify-between text-xs text-gray-500">
                            <span>Subtotal</span>
                            <span>{mmkFormatter.format(subtotal)}</span>
                          </div>
                          {discountAmount > 0 && (
                            <div className="flex justify-between text-xs text-rose-600 font-medium">
                              <span>Discount</span>
                              <span>-{mmkFormatter.format(discountAmount)}</span>
                            </div>
                          )}
                          {taxAmount > 0 && (
                            <div className="flex justify-between text-xs text-blue-600 font-medium">
                              <span>Tax</span>
                              <span>+{mmkFormatter.format(taxAmount)}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center pt-2">
                            <span className="text-sm font-bold text-gray-900">Total Amount</span>
                            <span className="text-lg font-bold text-blue-600">{mmkFormatter.format(order.total)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="px-5 py-4 bg-gray-50/50 border-t flex gap-2">
                      <button
                        onClick={() => printReceipt(order)}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition shadow-sm"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Print
                      </button>
                      
                      {order.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleComplete(order)}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 border border-emerald-600 rounded-xl text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-sm"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                            Done
                          </button>
                          <button
                            onClick={() => handleCancel(order)}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-rose-50 border border-rose-100 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-100 transition"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
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
            {totalPages > 1 && (
              <div className="mt-12 flex justify-center">
                <nav className="inline-flex items-center p-1 bg-white border border-gray-200 rounded-2xl shadow-sm gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(p - 1, 1))}
                    disabled={page === 1}
                    className="p-2 rounded-xl text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent transition"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  <div className="flex items-center px-2">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else {
                        if (page <= 3) pageNum = i + 1;
                        else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                        else pageNum = page - 2 + i;
                      }
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`w-10 h-10 rounded-xl text-sm font-semibold transition ${
                            page === pageNum 
                              ? "bg-blue-600 text-white shadow-md shadow-blue-200" 
                              : "text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                    disabled={page === totalPages}
                    className="p-2 rounded-xl text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent transition"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </nav>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
