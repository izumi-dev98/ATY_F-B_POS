import { useEffect, useMemo, useState } from "react";
import supabase from "../createClients";

export default function SaleUsageReport() {
  const [orders, setOrders] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [menus, setMenus] = useState([]);
  const [menuSets, setMenuSets] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const rowsPerPage = 15;

  const currentUser = JSON.parse(localStorage.getItem("user") || "null");
  const printedByName = currentUser?.full_name || currentUser?.username || currentUser?.id || "Unknown";

  const mmkFormatter = new Intl.NumberFormat("en-MM", {
    style: "currency",
    currency: "MMK",
    maximumFractionDigits: 0,
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: ordersData, error: ordersErr }, { data: itemsData, error: itemsErr }, { data: menusData, error: menusErr }, { data: menuSetsData, error: setsErr }, { data: usersData, error: usersErr }] = await Promise.all([
        supabase.from("orders").select("*").eq("status", "completed").order("created_at", { ascending: false }).range(0, 9999),
        supabase.from("order_items").select("*").range(0, 9999),
        supabase.from("menu").select("id, menu_name").range(0, 9999),
        supabase.from("menu_sets").select("id, set_name").range(0, 9999),
        supabase.from("user").select("id, full_name, username").range(0, 9999),
      ]);

      if (ordersErr) throw ordersErr;
      if (itemsErr) throw itemsErr;
      if (menusErr) throw menusErr;
      if (setsErr) throw setsErr;
      if (usersErr) throw usersErr;

      setOrders(ordersData || []);
      setOrderItems(itemsData || []);
      setMenus(menusData || []);
      setMenuSets(menuSetsData || []);
      setUsers(usersData || []);
    } catch (err) {
      console.error("SaleUsageReport.fetchData error:", err);
      setOrders([]);
      setOrderItems([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getCreatedAtDate = (createdAt) => {
    if (!createdAt) return null;
    const date = new Date(createdAt);
    return isNaN(date.getTime()) ? null : date;
  };

  const filteredItems = useMemo(() => {
    const now = new Date();
    let startDate = null;

    switch (dateFilter) {
      case "day":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "year":
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case "custom":
        if (customStart) startDate = new Date(customStart);
        break;
      default:
        startDate = null;
    }

    let endDate = null;
    if (dateFilter === "custom" && customEnd) {
      endDate = new Date(customEnd);
      endDate.setHours(23, 59, 59, 999);
    }

    const completedOrderIds = new Set((orders || []).map((order) => order.id));

    return (orderItems || [])
      .filter((item) => completedOrderIds.has(item.order_id))
      .map((item) => {
        const order = orders.find((o) => o.id === item.order_id) || {};
        const menu = menus.find((m) => String(m.id) === String(item.menu_id));
        const menuSet = menuSets.find((s) => String(s.id) === String(item.menu_set_id));
        const user = users.find((u) => u.id === order.completed_by);
        return {
          ...item,
          order_status: order.status,
          order_created_at: order.created_at,
          order_total: order.total,
          order_remark: order.remark,
          completed_by_name: user?.full_name || user?.username || "Unknown",
          menu_name: item.menu_set_id ? menuSet?.set_name || item.menu_name : menu?.menu_name || item.menu_name,
          payment_type: order.payment_type || "Cash",
          completed_at: order.completed_at,
          record_id: order.id,
        };
      })
      .filter((item) => {
        const recordDate = getCreatedAtDate(item.order_created_at);
        if (startDate && recordDate && recordDate < startDate) return false;
        if (endDate && recordDate && recordDate > endDate) return false;

        if (search) {
          const value = search.toLowerCase();
          const itemName = item.menu_name?.toLowerCase() || "";
          const orderId = String(item.order_id);
          const note = item.order_remark?.toLowerCase() || "";
          const userName = item.completed_by_name?.toLowerCase() || "";
          return (
            itemName.includes(value) ||
            orderId.includes(value) ||
            note.includes(value) ||
            userName.includes(value)
          );
        }
        return true;
      });
  }, [orders, orderItems, menus, menuSets, users, dateFilter, customStart, customEnd, search]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredItems.slice(start, start + rowsPerPage);
  }, [filteredItems, currentPage]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / rowsPerPage));

  const exportToExcel = () => {
    const reportData = filteredItems.map((item) => ({
      Date: item.order_created_at ? new Date(item.order_created_at).toLocaleDateString() : "-",
      "Order ID": item.order_id,
      "Item Name": item.menu_name || "Unknown",
      Qty: item.qty,
      "Unit Price": item.price != null ? mmkFormatter.format(item.price) : "-",
      Total: item.total != null ? mmkFormatter.format(item.total) : "-",
      "Payment Type": item.payment_type,
      "Completed By": item.completed_by_name,
      Notes: item.order_remark || "-",
    }));

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><table border="1"><tr style="background:#ddd;font-weight:bold;"><td>Date</td><td>Order ID</td><td>Item Name</td><td>Qty</td><td>Unit Price</td><td>Total</td><td>Payment Type</td><td>Completed By</td><td>Notes</td></tr>${reportData.map((row) => `<tr><td>${row.Date}</td><td>${row["Order ID"]}</td><td>${row["Item Name"]}</td><td>${row.Qty}</td><td>${row["Unit Price"]}</td><td>${row.Total}</td><td>${row["Payment Type"]}</td><td>${row["Completed By"]}</td><td>${row.Notes}</td></tr>`).join("")}</table></body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `sale_usage_report_${new Date().toISOString().split("T")[0]}.xls`;
    link.click();
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Sale Usage Report</h1>
          <p className="text-sm text-slate-500 mt-1">View completed orders and order item usage that reduce inventory.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowPreviewModal(true)}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
          >
            Preview & Print
          </button>
          <button
            onClick={exportToExcel}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Export Excel
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Search orders or items..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Date</label>
            <select
              value={dateFilter}
              onChange={(e) => { setDateFilter(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="all">All Time</option>
              <option value="day">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
              <option value="custom">Custom Date</option>
            </select>
          </div>
          {dateFilter === "custom" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => { setCustomStart(e.target.value); setCurrentPage(1); }}
                  className="px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => { setCustomEnd(e.target.value); setCurrentPage(1); }}
                  className="px-3 py-2 border rounded-lg"
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Order ID</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Item</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Qty</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Unit Price</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Total</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Payment</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Completed By</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Notes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>
            ) : paginatedItems.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">No sale usage records found.</td></tr>
            ) : (
              paginatedItems.map((item) => (
                <tr key={`${item.order_id}-${item.id}`} className="border-b border-slate-100 hover:bg-indigo-50 transition">
                  <td className="px-4 py-3 font-medium text-slate-700">#{item.order_id}</td>
                  <td className="px-4 py-3 text-slate-600">{item.menu_name || "Unknown"}</td>
                  <td className="px-4 py-3 text-slate-600">{item.qty}</td>
                  <td className="px-4 py-3 text-slate-600">{item.price != null ? mmkFormatter.format(item.price) : "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{item.total != null ? mmkFormatter.format(item.total) : "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{item.payment_type}</td>
                  <td className="px-4 py-3 text-slate-600">{item.completed_by_name}</td>
                  <td className="px-4 py-3 text-slate-600">{item.completed_at ? new Date(item.completed_at).toLocaleString() : "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{item.order_remark || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap justify-between items-center gap-2 mt-4">
        <p className="text-sm text-slate-500">Showing {paginatedItems.length} of {filteredItems.length} records</p>
        <div className="flex items-center gap-2">
          <button
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            className="px-3 py-2 border rounded-lg text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-slate-600">Page {currentPage} of {totalPages}</span>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            className="px-3 py-2 border rounded-lg text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {showPreviewModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-6xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div>
                <h3 className="text-xl font-semibold">Sale Usage Report Preview</h3>
                <p className="text-sm text-slate-500">Printed by {printedByName} on {new Date().toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => window.print()} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm">Print</button>
                <button onClick={() => setShowPreviewModal(false)} className="px-4 py-2 bg-slate-100 rounded-lg text-sm">Close</button>
              </div>
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-left">Order ID</th>
                    <th className="px-4 py-3 text-left">Item</th>
                    <th className="px-4 py-3 text-left">Qty</th>
                    <th className="px-4 py-3 text-left">Unit Price</th>
                    <th className="px-4 py-3 text-left">Total</th>
                    <th className="px-4 py-3 text-left">Payment</th>
                    <th className="px-4 py-3 text-left">Completed By</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">No sale usage data available.</td></tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr key={`${item.order_id}-${item.id}`} className="border-b border-slate-100">
                        <td className="px-4 py-3">#{item.order_id}</td>
                        <td className="px-4 py-3">{item.menu_name || "Unknown"}</td>
                        <td className="px-4 py-3">{item.qty}</td>
                        <td className="px-4 py-3">{item.price != null ? mmkFormatter.format(item.price) : "-"}</td>
                        <td className="px-4 py-3">{item.total != null ? mmkFormatter.format(item.total) : "-"}</td>
                        <td className="px-4 py-3">{item.payment_type}</td>
                        <td className="px-4 py-3">{item.completed_by_name}</td>
                        <td className="px-4 py-3">{item.completed_at ? new Date(item.completed_at).toLocaleString() : "-"}</td>
                        <td className="px-4 py-3">{item.order_remark || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
