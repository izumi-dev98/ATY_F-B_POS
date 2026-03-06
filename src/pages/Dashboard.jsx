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
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const mmkFormatter = new Intl.NumberFormat("en-MM", {
    style: "currency",
    currency: "MMK",
    maximumFractionDigits: 0,
  });

  const fetchDashboardData = async (monthYear) => {
    try {
      const [year, month] = monthYear.split("-");
      const startOfMonth = new Date(year, month - 1, 1).toISOString();
      const endOfMonth = new Date(year, month, 0, 23, 59, 59).toISOString();

      const { data: orders, error: ordersErr } = await supabase
        .from("orders")
        .select("*")
        .eq("status", "completed")
        .gte("created_at", startOfMonth)
        .lte("created_at", endOfMonth);

      if (ordersErr) throw ordersErr;

      const { data: orderItems, error: itemsErr } = await supabase
        .from("order_items")
        .select("*");
      if (itemsErr) throw itemsErr;

      const { data: menuData, error: menuErr } = await supabase.from("menu").select("*");
      if (menuErr) throw menuErr;

      const itemsWithMenu = orderItems.map((item) => {
        const menu = menuData.find((m) => m.id === item.menu_id);
        return {
          ...item,
          menu_name: menu?.menu_name || "Unknown",
          total_price: item.price * item.qty,
        };
      });

      const monthItems = itemsWithMenu.filter((i) =>
        orders.some((o) => o.id === i.order_id)
      );

      const salesMap = {};
      monthItems.forEach((i) => {
        if (!salesMap[i.menu_name]) salesMap[i.menu_name] = 0;
        salesMap[i.menu_name] += i.total_price;
      });

      const sortedMenus = Object.entries(salesMap).sort((a, b) => b[1] - a[1]);
      setMostSelling(sortedMenus[0] || null);

      setMonthlyData(
        sortedMenus.map(([name, total]) => ({
          name,
          total,
        }))
      );
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchDashboardData(selectedMonth);
  }, [selectedMonth]);

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

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false, // Makes chart height customizable
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => mmkFormatter.format(context.raw),
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
    <div className="flex flex-col h-full mt-10">

      <h1 className="text-2xl md:text-3xl font-bold mb-4 text-center">
        Dashboard
      </h1>

      <div className="bg-white rounded-2xl shadow-lg p-4 md:p-6 flex flex-col flex-1 overflow-hidden">

        {/* Month selector */}
        <div className="flex justify-end mb-3">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500"
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

        <h2 className="text-lg md:text-xl font-semibold mb-3">Monthly Sales</h2>

        {/* Scrollable content */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0">
            {monthlyData.length === 0 ? (
              <p className="text-gray-500 text-center mt-10">
                No sales data for this month.
              </p>
            ) : (
              <Bar data={chartData} options={chartOptions} className="h-full" />
            )}
          </div>

          {mostSelling && (
            <div className="mt-4 p-4 bg-blue-50 border-l-4 border-blue-600 rounded-lg">
              <h3 className="font-semibold">Most Selling Menu</h3>
              <p>
                {mostSelling[0]} — {mmkFormatter.format(mostSelling[1])}
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );


}
