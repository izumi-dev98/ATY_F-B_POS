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
  }).filter((item) => item.menu_name.toLowerCase().includes(search.toLowerCase()));

  // Pagination
  const indexOfLast = currentPage * rowsPerPage;
  const indexOfFirst = indexOfLast - rowsPerPage;
  const currentData = filteredData.slice(indexOfFirst, indexOfLast);
  const totalPages = Math.ceil(filteredData.length / rowsPerPage);

  const totalSales = filteredData.reduce((sum, i) => sum + i.price * i.qty, 0);

  const exportToExcel = () => {
    const exportData = filteredData.map((item) => ({
      Order_ID: item.order_id,
      Menu: item.menu_name,
      Quantity: item.qty,
      Price: item.price,
      Total: item.qty * item.price,
      Date: item.created_at,
    }));

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
    <div className="p-6 min-h-screen bg-gray-50">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Total Sales Report</h1>
        <button
          onClick={exportToExcel}
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg shadow"
        >
          Export Excel
        </button>
      </div>

      {/* Preset filters */}
      <div className="flex gap-2 flex-wrap mb-4">
        {["all", "day", "week", "month", "year"].map((f) => (
          <button
            key={f}
            onClick={() => {
              setPresetFilter(f);
              setCustomStart("");
              setCustomEnd("");
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-lg capitalize ${
              presetFilter === f
                ? "bg-blue-600 text-white"
                : "bg-white border"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      <div className="flex gap-2 mb-4 items-center">
        <input
          type="date"
          value={customStart}
          onChange={(e) => setCustomStart(e.target.value)}
          className="border px-3 py-2 rounded-lg"
        />
        <span>-</span>
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
      </div>

      {/* Total sales */}
      <div className="bg-white p-4 rounded-xl shadow mb-4">
        <h2 className="text-lg font-semibold text-gray-700">
          Total Sales: {mmkFormatter.format(totalSales)}
        </h2>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search menu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full md:w-1/3 border px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {/* Table */}
      <div className="bg-white shadow-xl rounded-xl overflow-hidden">
        <table className="min-w-full text-left">
          <thead className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
            <tr>
              <th className="px-6 py-3">Slip ID</th>
              <th className="px-6 py-3">Menu</th>
              <th className="px-6 py-3">Qty</th>
              <th className="px-6 py-3">Price</th>
              <th className="px-6 py-3">Total</th>
              <th className="px-6 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" className="text-center py-6">Loading...</td>
              </tr>
            ) : currentData.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center py-6">No Data Found</td>
              </tr>
            ) : (
              currentData.map((item) => (
                <tr key={item.id} className="border-b hover:bg-blue-50 transition">
                  <td className="px-6 py-3">{item.order_id}</td>
                  <td className="px-6 py-3 font-medium text-gray-700">{item.menu_name}</td>
                  <td className="px-6 py-3">{item.qty}</td>
                  <td className="px-6 py-3 text-green-600">{mmkFormatter.format(item.price)}</td>
                  <td className="px-6 py-3 text-green-600 font-semibold">{mmkFormatter.format(item.price * item.qty)}</td>
                  <td className="px-6 py-3 text-gray-600">{new Date(item.created_at).toLocaleDateString()}</td>
                </tr>
              ))
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
