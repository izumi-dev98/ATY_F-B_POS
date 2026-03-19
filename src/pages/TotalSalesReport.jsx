import { useEffect, useState } from "react";
import supabase from "../createClients";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

export default function TotalSalesReport() {
  const [orderItems, setOrderItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Preset filter: "all", "day", "week", "month", "year"
  const [presetFilter, setPresetFilter] = useState("all");

  // Payment type filter: "all", "cash", "card"
  const [paymentFilter, setPaymentFilter] = useState("all");

  // Custom date range
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  const mmkFormatter = new Intl.NumberFormat("en-MM", {
    style: "currency",
    currency: "MMK",
    maximumFractionDigits: 0,
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch only completed orders
      const { data: ordersData, error: ordersErr } = await supabase
        .from("orders")
        .select("*")
        .eq("status", "completed")
        .order("created_at", { ascending: false });
      if (ordersErr) throw ordersErr;

      const orderIds = ordersData.map(o => o.id);

      // Fetch order items only for completed orders
      let items;
      if (orderIds.length > 0) {
        const { data } = await supabase
          .from("order_items")
          .select("*")
          .in("order_id", orderIds);
        items = data || [];
      } else {
        items = [];
      }

      const { data: menuData, error: menuErr } = await supabase.from("menu").select("id, menu_name");
      if (menuErr) throw menuErr;

      setOrders(ordersData || []);
      setMenus(menuData || []);

      const merged = (items || []).map((item) => {
        const order = (ordersData || []).find((o) => o.id === item.order_id);
        const menu = (menuData || []).find((m) => m.id === item.menu_id);
        return {
          ...item,
          total: order?.total || 0,
          created_at: order?.created_at,
          menu_name: menu?.menu_name || "Unknown",
          payment_type: order?.payment_type || "cash",
          remark: order?.remark || null,
        };
      });

      merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setOrderItems(merged);
    } catch (err) {
      console.error("Error fetching data:", err);
      setOrderItems([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const now = new Date();

  const filteredData = orderItems.filter((item) => {
    const date = new Date(item.created_at);

    // Custom filter has priority
    if (customStart && customEnd) {
      const start = new Date(customStart);
      const end = new Date(customEnd);
      end.setHours(23, 59, 59, 999);
      return date >= start && date <= end;
    }

    // Preset filters
    switch (presetFilter) {
      case "day":
        return (
          date.getDate() === now.getDate() &&
          date.getMonth() === now.getMonth() &&
          date.getFullYear() === now.getFullYear()
        );
      case "week": {
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        return date >= weekAgo;
      }
      case "month":
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      case "year":
        return date.getFullYear() === now.getFullYear();
      default:
        return true;
    }
  }).filter((item) => item.menu_name.toLowerCase().includes(search.toLowerCase()))
  .filter((item) => {
    if (paymentFilter === "all") return true;
    const paymentType = item.payment_type || "Cash";
    return paymentType === paymentFilter;
  });

  // Group order items by slip (order_id)
  const groupedBySlip = () => {
    const groups = {};
    filteredData.forEach((item) => {
      if (!groups[item.order_id]) {
        const order = orders.find((o) => o.id === item.order_id);
        groups[item.order_id] = {
          order_id: item.order_id,
          menus: [],
          qty: 0,
          price: 0,
          item_total: 0,
          subtotal: order?.subtotal || 0,
          discount_amount: order?.discount_amount || 0,
          tax_amount: order?.tax_amount || 0,
          total: order?.total || 0,
          payment_type: item.payment_type || "Cash",
          remark: item.remark || null,
          created_at: item.created_at,
        };
      }
      groups[item.order_id].menus.push({ menu_name: item.menu_name, qty: item.qty, price: item.price });
      groups[item.order_id].qty += item.qty;
      groups[item.order_id].price += item.price;
      groups[item.order_id].item_total += item.qty * item.price;
    });
    return Object.values(groups).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  };

  const slipData = groupedBySlip();

  // Pagination
  const indexOfLast = currentPage * rowsPerPage;
  const indexOfFirst = indexOfLast - rowsPerPage;
  const currentData = slipData.slice(indexOfFirst, indexOfLast);
  const totalPages = Math.ceil(slipData.length / rowsPerPage);

  // Calculate totals from slip data
  const getOrderTotals = () => {
    const totalSubtotal = slipData.reduce((sum, s) => sum + s.subtotal, 0);
    const totalDiscount = slipData.reduce((sum, s) => sum + s.discount_amount, 0);
    const totalTax = slipData.reduce((sum, s) => sum + s.tax_amount, 0);
    const grandTotal = slipData.reduce((sum, s) => sum + s.total, 0);

    return { totalSubtotal, totalDiscount, totalTax, grandTotal };
  };

  const { totalSubtotal, totalDiscount, totalTax, grandTotal } = getOrderTotals();

  const exportToExcel = () => {
    const exportData = slipData.map((slip) => {
      const menusText = slip.menus.map(m => `${m.menu_name} x${m.qty}`).join(", ");
      const paymentText = slip.payment_type === "Cash" ? "Cash" : slip.payment_type === "Kpay" ? "Kpay" : "FOC";
      const displayRemark = slip.remark || "";
      return {
        Slip_ID: slip.order_id,
        Menu: menusText,
        Qty: slip.qty,
        Subtotal: slip.subtotal,
        Discount: slip.discount_amount,
        Tax: slip.tax_amount,
        Grand_Total: slip.total,
        Payment: paymentText,
        Remark: displayRemark,
        Date: slip.created_at,
      };
    });

    // Add total row
    exportData.push({
      Slip_ID: "",
      Menu: "TOTAL AMOUNT",
      Qty: "",
      Subtotal: totalSubtotal,
      Discount: totalDiscount,
      Tax: totalTax,
      Grand_Total: grandTotal,
      Payment: "",
      Remark: "",
      Date: "",
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales Report");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const fileData = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(fileData, "Total_Sales_Report.xlsx");
  };

  return (
    <div className="p-6 min-h-screen bg-slate-50">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Total Sales Report</h1>
          <p className="text-sm text-slate-500 mt-1">View sales report</p>
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
            value={presetFilter}
            onChange={(e) => {
              setPresetFilter(e.target.value);
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
          {presetFilter === "custom" && (
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

          {/* Payment Type Filter */}
          <span className="text-sm font-medium text-gray-700 self-center">Payment:</span>
          {["all", "Cash", "Kpay", "FOC"].map((p) => (
            <button
              key={p}
              onClick={() => {
                setPaymentFilter(p);
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg capitalize ${
                paymentFilter === p
                  ? p === "Cash" ? "bg-green-600 text-white" : p === "Kpay" ? "bg-blue-600 text-white" : p === "FOC" ? "bg-purple-600 text-white" : "bg-blue-600 text-white"
                  : "bg-white border"
              }`}
            >
              {p}
            </button>
          ))}

          {/* Search */}
          <input
            type="text"
            placeholder="Search menu..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-4 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Total sales */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <p className="text-sm text-gray-500">Subtotal</p>
            <p className="text-lg font-semibold">{mmkFormatter.format(totalSubtotal)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Discount</p>
            <p className="text-lg font-semibold text-red-500">-{mmkFormatter.format(totalDiscount)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Tax</p>
            <p className="text-lg font-semibold text-blue-500">+{mmkFormatter.format(totalTax)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Grand Total</p>
            <p className="text-xl font-bold text-green-600">{mmkFormatter.format(grandTotal)}</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Slip ID</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Menu</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Qty</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Subtotal</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Discount</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Tax</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Grand Total</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Payment</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Remark</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="10" className="text-center py-6">Loading...</td>
              </tr>
            ) : currentData.length === 0 ? (
              <tr>
                <td colSpan="10" className="text-center py-6">No Data Found</td>
              </tr>
            ) : (
              currentData.map((slip) => {
                const paymentType = slip.payment_type || "Cash";
                const menusText = slip.menus.map(m => `${m.menu_name} x${m.qty}`).join(", ");
                const displayRemark = slip.remark || "-";
                return (
                <tr key={slip.order_id} className="border-b border-slate-100 hover:bg-indigo-50/50 transition">
                  <td className="px-4 py-3">{slip.order_id}</td>
                  <td className="px-4 py-3 font-medium text-gray-700">{menusText}</td>
                  <td className="px-4 py-3">{slip.qty}</td>
                  <td className="px-4 py-3">{mmkFormatter.format(slip.subtotal)}</td>
                  <td className="px-4 py-3 text-red-500">{mmkFormatter.format(slip.discount_amount)}</td>
                  <td className="px-4 py-3 text-blue-500">{mmkFormatter.format(slip.tax_amount)}</td>
                  <td className="px-4 py-3 text-green-700 font-bold">{mmkFormatter.format(slip.total)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      paymentType === "Cash" ? "bg-green-100 text-green-800" : paymentType === "Kpay" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"
                    }`}>
                      {paymentType === "Cash" ? "Cash" : paymentType === "Kpay" ? "Kpay" : "FOC"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{displayRemark}</td>
                  <td className="px-4 py-3 text-gray-600">{new Date(slip.created_at).toLocaleDateString()}</td>
                </tr>
              );
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex justify-between items-center p-4 bg-gray-50">
          <span className="text-sm">Page {currentPage} of {totalPages || 1}</span>
          <div className="space-x-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
              className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
            >
              Prev
            </button>
            <button
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(currentPage + 1)}
              className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
