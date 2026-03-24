// pages/Dashboard.jsx
import { useEffect, useState } from "react";
import supabase from "../createClients";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function Dashboard() {
  const [monthlyData, setMonthlyData] = useState([]);
  const [mostSelling, setMostSelling] = useState(null);
  const [grandTotal, setGrandTotal] = useState(0);
  const [menuOptions, setMenuOptions] = useState([]);
  const [selectedMenu, setSelectedMenu] = useState("all");
  const [inventoryChartData, setInventoryChartData] = useState([]);
  const [supplierChartData, setSupplierChartData] = useState([]);
  const [inventoryFilter, setInventoryFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const mmkFormatter = new Intl.NumberFormat("en-MM", {
    style: "currency",
    currency: "MMK",
    maximumFractionDigits: 0,
  });

  // Fetch menu and menu set list for filter
  useEffect(() => {
    const fetchMenuOptions = async () => {
      const [{ data: menus }, { data: sets }] = await Promise.all([
        supabase.from("menu").select("id, menu_name"),
        supabase.from("menu_sets").select("id, set_name"),
      ]);

      const options = [
        ...((menus || []).map((m) => ({ key: `menu:${m.id}`, label: m.menu_name, type: "menu", id: m.id }))),
        ...((sets || []).map((s) => ({ key: `set:${s.id}`, label: s.set_name, type: "set", id: s.id }))),
      ];
      setMenuOptions(options);
    };
    fetchMenuOptions();
  }, []);

  const fetchDashboardData = async (monthYear) => {
    try {
      const [year, month] = monthYear.split("-");
      const startOfMonth = new Date(year, month - 1, 1).toISOString();
      const endOfMonth = new Date(year, month, 0, 23, 59, 59).toISOString();

      const [
        { data: orders, error: ordersErr },
        { data: orderItems, error: itemsErr },
        { data: menuData, error: menuErr },
        { data: menuSetsData, error: menuSetsErr },
        { data: inventoryData, error: inventoryErr },
        { data: suppliersData, error: suppliersErr },
        { data: purchasesData, error: purchasesErr },
      ] = await Promise.all([
        supabase
          .from("orders")
          .select("*")
          .eq("status", "completed")
          .gte("created_at", startOfMonth)
          .lte("created_at", endOfMonth),
        supabase.from("order_items").select("*"),
        supabase.from("menu").select("id, menu_name"),
        supabase.from("menu_sets").select("id, set_name"),
        supabase.from("inventory").select("id, item_name, qty").order("qty", { ascending: false }),
        supabase.from("suppliers").select("id, name"),
        supabase
          .from("purchases")
          .select("id, supplier_id, status, total_amount, created_at")
          .eq("status", "received")
          .gte("created_at", startOfMonth)
          .lte("created_at", endOfMonth),
      ]);

      if (ordersErr) throw ordersErr;
      if (itemsErr) throw itemsErr;
      if (menuErr) throw menuErr;
      if (menuSetsErr) throw menuSetsErr;
      if (inventoryErr) throw inventoryErr;
      if (suppliersErr) throw suppliersErr;
      if (purchasesErr) throw purchasesErr;

      const menuNameById = new Map((menuData || []).map((m) => [m.id, m.menu_name]));
      const setNameById = new Map((menuSetsData || []).map((s) => [s.id, s.set_name]));
      const completedOrderIds = new Set((orders || []).map((o) => o.id));

      const monthItems = (orderItems || [])
        .filter((i) => completedOrderIds.has(i.order_id))
        .map((i) => {
          if (i.menu_set_id) {
            return {
              ...i,
              item_key: `set:${i.menu_set_id}`,
              item_name: setNameById.get(i.menu_set_id) || "Unknown Set",
              total_price: (parseFloat(i.price) || 0) * (parseFloat(i.qty) || 0),
            };
          }
          return {
            ...i,
            item_key: `menu:${i.menu_id}`,
            item_name: menuNameById.get(i.menu_id) || "Unknown Menu",
            total_price: (parseFloat(i.price) || 0) * (parseFloat(i.qty) || 0),
          };
        });

      // Filter by selected item (menu or set)
      const filteredItems =
        selectedMenu === "all"
          ? monthItems
          : monthItems.filter((i) => i.item_key === selectedMenu);

      const filteredOrderIds = [...new Set(filteredItems.map((i) => i.order_id))];
      const filteredOrders = (orders || []).filter((o) => filteredOrderIds.includes(o.id));
      setGrandTotal(filteredOrders.reduce((sum, order) => sum + (parseFloat(order.total) || 0), 0));

      const salesMap = {};
      filteredItems.forEach((i) => {
        if (!salesMap[i.item_name]) salesMap[i.item_name] = 0;
        salesMap[i.item_name] += i.total_price;
      });

      const sortedSales = Object.entries(salesMap).sort((a, b) => b[1] - a[1]);
      setMostSelling(sortedSales[0] || null);
      setMonthlyData(sortedSales.map(([name, total]) => ({ name, total })));

      // Inventory chart: current top 10 stock qty
      const invTop10 = (inventoryData || []).slice(0, 10).map((inv) => ({
        name: inv.item_name,
        qty: parseFloat(inv.qty) || 0,
      }));
      setInventoryChartData(invTop10);

      // Supplier chart: received purchase total by supplier in selected month
      const supplierTotals = {};
      (purchasesData || []).forEach((p) => {
        const supplierName =
          (suppliersData || []).find((s) => s.id === p.supplier_id)?.name || "Unknown Supplier";
        if (!supplierTotals[supplierName]) supplierTotals[supplierName] = 0;
        supplierTotals[supplierName] += parseFloat(p.total_amount) || 0;
      });
      const supplierSorted = Object.entries(supplierTotals)
        .sort((a, b) => b[1] - a[1])
        .map(([name, total]) => ({ name, total }));
      setSupplierChartData(supplierSorted);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchDashboardData(selectedMonth);
  }, [selectedMonth, selectedMenu]);

  const chartData = {
    labels: monthlyData.map((d) => d.name),
    datasets: [
      {
        label: "Total Sales (MMK)",
        data: monthlyData.map((d) => d.total),
        backgroundColor: "rgba(37, 99, 235, 0.8)",
        borderRadius: 6,
      },
    ],
  };

  const inventoryDataForChart = {
    labels: inventoryChartData
      .filter((d) => {
        if (inventoryFilter === "low") return d.qty > 0 && d.qty < 10;
        if (inventoryFilter === "out") return d.qty === 0;
        return true;
      })
      .map((d) => d.name),
    datasets: [
      {
        label: "Stock Qty",
        data: inventoryChartData
          .filter((d) => {
            if (inventoryFilter === "low") return d.qty > 0 && d.qty < 10;
            if (inventoryFilter === "out") return d.qty === 0;
            return true;
          })
          .map((d) => d.qty),
        backgroundColor: "rgba(16, 185, 129, 0.8)",
        borderRadius: 6,
      },
    ],
  };

  const supplierDataForChart = {
    labels: supplierChartData
      .filter((d) => (supplierFilter === "all" ? true : d.name === supplierFilter))
      .map((d) => d.name),
    datasets: [
      {
        label: "Purchase Total (MMK)",
        data: supplierChartData
          .filter((d) => (supplierFilter === "all" ? true : d.name === supplierFilter))
          .map((d) => d.total),
        backgroundColor: "rgba(249, 115, 22, 0.8)",
        borderRadius: 6,
      },
    ],
  };

  const currencyChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) =>
            typeof context.raw === "number" ? mmkFormatter.format(context.raw) : context.raw,
        },
      },
    },
    scales: {
      y: {
        ticks: {
          callback: (value) => mmkFormatter.format(value),
        },
      },
    },
  };

  const qtyChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      y: {
        ticks: {
          callback: (value) => value,
        },
      },
    },
  };

  const getLast12Months = () => {
    const months = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return months;
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">View sales analytics</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">

        {/* Month selector */}
        <div className="flex justify-end mb-4 gap-2">
          <select
            value={selectedMenu}
            onChange={(e) => setSelectedMenu(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Menu & Set</option>
            {menuOptions.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {getLast12Months().map((m) => {
              const [year, month] = m.split("-");
              const date = new Date(year, month - 1, 1);
              return (
                <option key={m} value={m}>
                  {date.toLocaleString("default", { month: "long", year: "numeric" })}
                </option>
              );
            })}
          </select>
        </div>

        <h2 className="text-lg md:text-xl font-semibold mb-3">Monthly Sales (Menu + Menu Set)</h2>

        {/* Scrollable content */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0">
            {monthlyData.length === 0 ? (
              <p className="text-gray-500 text-center mt-10">
                No sales data for this month.
              </p>
            ) : (
              <div className="h-80">
                <Bar data={chartData} options={currencyChartOptions} className="h-full" />
              </div>
            )}
          </div>

          {mostSelling && (
            <div className="mt-4 p-4 bg-blue-50 border-l-4 border-blue-600 rounded-lg">
              <h3 className="font-semibold">Most Selling (Menu + Set)</h3>
              <p>
                {mostSelling[0]} — {mmkFormatter.format(mostSelling[1])}
              </p>
            </div>
          )}

          {grandTotal > 0 && (
            <div className="mt-4 p-4 bg-green-50 border-l-4 border-green-600 rounded-lg">
              <h3 className="font-semibold">Grand Total</h3>
              <p className="text-xl font-bold text-green-700">
                {mmkFormatter.format(grandTotal)}
              </p>
            </div>
          )}
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-lg md:text-xl font-semibold">Inventory Stock Chart</h2>
            <select
              value={inventoryFilter}
              onChange={(e) => setInventoryFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Stock</option>
              <option value="low">Low Stock (&lt; 10)</option>
              <option value="out">Out of Stock (= 0)</option>
            </select>
          </div>
          {inventoryChartData.length === 0 ? (
            <p className="text-gray-500 text-center mt-10">No inventory data.</p>
          ) : inventoryDataForChart.labels.length === 0 ? (
            <p className="text-gray-500 text-center mt-10">No data for selected inventory filter.</p>
          ) : (
            <div className="h-80">
              <Bar data={inventoryDataForChart} options={qtyChartOptions} />
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-lg md:text-xl font-semibold">Supplier Purchase Chart</h2>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Suppliers</option>
              {supplierChartData.map((s) => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
          {supplierChartData.length === 0 ? (
            <p className="text-gray-500 text-center mt-10">No supplier purchase data for this month.</p>
          ) : supplierDataForChart.labels.length === 0 ? (
            <p className="text-gray-500 text-center mt-10">No data for selected supplier.</p>
          ) : (
            <div className="h-80">
              <Bar data={supplierDataForChart} options={currencyChartOptions} />
            </div>
          )}
        </div>
      </div>
    </div>
  );


}
