import { useEffect, useState } from "react";
import supabase from "../createClients";
import Swal from "sweetalert2";

export default function History({ setInventory }) {
  const [history, setHistory] = useState([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [ingredientsMap, setIngredientsMap] = useState({});
  const ordersPerPage = 8;

  const mmkFormatter = new Intl.NumberFormat("en-MM", {
    style: "currency",
    currency: "MMK",
    maximumFractionDigits: 0,
  });

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

      const { data: ingData, error: ingErr } = await supabase.from("menu_ingredients").select("*");
      if (ingErr) throw ingErr;

      // Build ingredients map
      const ingMap = {};
      ingData.forEach((ing) => {
        if (!ingMap[ing.menu_id]) ingMap[ing.menu_id] = [];
        ingMap[ing.menu_id].push(ing);
      });
      setIngredientsMap(ingMap);

      // Merge menu names
      const historyData = orders.map((order) => {
        const items = orderItems
          .filter((i) => i.order_id === order.id)
          .map((i) => ({
            ...i,
            menu_name: menuData.find((m) => m.id === i.menu_id)?.menu_name || "Unknown Menu",
          }));
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

  // Filtered history based on search
  const filteredHistory = history.filter((order) => {
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
            <tfoot><tr><td colspan="3">Total</td><td>${mmkFormatter.format(order.total)}</td></tr></tfoot>
          </table>
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

  // Complete order - just update status (inventory already deducted in Payment)
  const handleComplete = async (order) => {
    try {
      // Update order status to completed (inventory already deducted when printed)
      await supabase.from("orders").update({ status: "completed" }).eq("id", order.id);

      Swal.fire("Success", "Order marked as completed!", "success");
      fetchHistory();
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to complete order", "error");
    }
  };

  // Cancel order - return inventory
  const handleCancel = async (order) => {
    const result = await Swal.fire({
      title: "Cancel Order?",
      text: "This will return items to inventory and remove from sales.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Cancel",
      cancelButtonText: "No"
    });

    if (!result.isConfirmed) return;

    try {
      // Get inventory data
      const { data: inventoryData } = await supabase.from("inventory").select("*");
      const updatedInventory = inventoryData.map((i) => ({ ...i }));

      // Return inventory
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

      // Update order status to cancelled
      await supabase.from("orders").update({ status: "cancelled" }).eq("id", order.id);

      // Update inventory state
      if (setInventory) {
        setInventory(updatedInventory);
      }

      Swal.fire("Cancelled", "Order cancelled and inventory returned!", "success");
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
    <div className="min-h-screen p-6 bg-gray-100">
      <h1 className="text-3xl font-bold mb-6 text-center">Order History</h1>

      {/* Search */}
      <div className="flex justify-center mb-6">
        <input
          type="text"
          placeholder="Search by Order ID or Item Name..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full max-w-md px-4 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {filteredHistory.length === 0 ? (
        <p className="text-gray-400 text-center mt-20">No orders found</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedHistory.map((order , index) => {
              const statusBadge = getStatusBadge(order.status);
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
                          <span>{item.menu_name} × {item.qty}</span>
                          <span>{mmkFormatter.format(item.price * item.qty)}</span>
                        </li>
                      ))}
                    </ul>
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
