import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import supabase from "../createClients";

export default function ProfitLossReport() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [periodFilter, setPeriodFilter] = useState("this-year");
  const [resultFilter, setResultFilter] = useState("all");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");

  const mmkFormatter = new Intl.NumberFormat("en-MM", {
    style: "currency",
    currency: "MMK",
    maximumFractionDigits: 0,
  });

  const formatMonthLabel = (monthKey) => {
    const [year, month] = monthKey.split("-");
    return new Date(Number(year), Number(month) - 1, 1).toLocaleString("default", {
      month: "long",
      year: "numeric",
    });
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: orders, error: orderErr }, { data: purchases, error: purchaseErr }] = await Promise.all([
        supabase.from("orders").select("total, created_at, status").eq("status", "completed"),
        supabase.from("purchases").select("total_amount, created_at, status").eq("status", "received"),
      ]);

      if (orderErr) throw orderErr;
      if (purchaseErr) throw purchaseErr;

      const monthlyMap = {};

      (orders || []).forEach((order) => {
        if (!order.created_at) return;
        const monthKey = order.created_at.slice(0, 7);
        if (!monthlyMap[monthKey]) monthlyMap[monthKey] = { month: monthKey, revenue: 0, expense: 0 };
        monthlyMap[monthKey].revenue += parseFloat(order.total) || 0;
      });

      (purchases || []).forEach((purchase) => {
        if (!purchase.created_at) return;
        const monthKey = purchase.created_at.slice(0, 7);
        if (!monthlyMap[monthKey]) monthlyMap[monthKey] = { month: monthKey, revenue: 0, expense: 0 };
        monthlyMap[monthKey].expense += parseFloat(purchase.total_amount) || 0;
      });

      const mergedAsc = Object.values(monthlyMap)
        .map((item) => {
          const net = item.revenue - item.expense;
          const profit = net > 0 ? net : 0;
          const loss = net < 0 ? Math.abs(net) : 0;
          return {
            ...item,
            net,
            profit,
            loss,
            result: net > 0 ? "profit" : net < 0 ? "loss" : "breakeven",
          };
        })
        .sort((a, b) => a.month.localeCompare(b.month));

      const withChange = mergedAsc.map((item, index) => {
        if (index === 0) return { ...item, changePct: null };
        const prevNet = mergedAsc[index - 1].net;
        if (prevNet === 0) return { ...item, changePct: null };
        const changePct = ((item.net - prevNet) / Math.abs(prevNet)) * 100;
        return { ...item, changePct };
      });

      const merged = withChange.sort((a, b) => b.month.localeCompare(a.month));

      setRows(merged);
    } catch (err) {
      console.error("Failed to load profit/loss report:", err);
      setRows([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredRows = useMemo(() => {
    const now = new Date();
    const thisYear = `${now.getFullYear()}`;

    return rows
      .filter((row) => {
        if (periodFilter === "all") return true;
        if (periodFilter === "this-year") return row.month.startsWith(thisYear);
        if (periodFilter === "custom") {
          if (!startMonth || !endMonth) return true;
          return row.month >= startMonth && row.month <= endMonth;
        }
        return true;
      })
      .filter((row) => {
        if (resultFilter === "all") return true;
        return row.result === resultFilter;
      })
      .filter((row) => {
        const label = formatMonthLabel(row.month).toLowerCase();
        return label.includes(searchTerm.toLowerCase());
      });
  }, [rows, periodFilter, resultFilter, startMonth, endMonth, searchTerm]);

  const totals = useMemo(() => {
    const revenue = filteredRows.reduce((sum, row) => sum + row.revenue, 0);
    const expense = filteredRows.reduce((sum, row) => sum + row.expense, 0);
    const profit = filteredRows.reduce((sum, row) => sum + row.profit, 0);
    const loss = filteredRows.reduce((sum, row) => sum + row.loss, 0);
    return {
      revenue,
      expense,
      net: revenue - expense,
      profit,
      loss,
    };
  }, [filteredRows]);

  const exportToExcel = () => {
    const exportData = filteredRows.map((row) => ({
      Month: formatMonthLabel(row.month),
      Revenue: row.revenue,
      Expense: row.expense,
      Profit: row.profit,
      Loss: row.loss,
      Net: row.net,
      Change_Percent: row.changePct == null ? "-" : `${row.changePct.toFixed(2)}%`,
      Result: row.result,
    }));

    exportData.push({
      Month: "TOTAL",
      Revenue: totals.revenue,
      Expense: totals.expense,
      Profit: totals.profit,
      Loss: totals.loss,
      Net: totals.net,
      Change_Percent: "-",
      Result: totals.net > 0 ? "profit" : totals.net < 0 ? "loss" : "breakeven",
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Profit_Loss_Report");
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const fileData = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const today = new Date().toISOString().slice(0, 10);
    saveAs(fileData, `Profit_Loss_Report_${today}.xlsx`);
  };

  const badgeClass = (result) => {
    if (result === "profit") return "bg-emerald-100 text-emerald-700";
    if (result === "loss") return "bg-rose-100 text-rose-700";
    return "bg-slate-100 text-slate-700";
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Profit &amp; Loss Report</h1>
          <p className="text-sm text-slate-500 mt-1">Monthly revenue vs expense report</p>
        </div>
        <button
          onClick={exportToExcel}
          className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
        >
          Export Excel
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Period</label>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All</option>
              <option value="this-year">This Year</option>
              <option value="custom">Custom Month Range</option>
            </select>
          </div>

          {periodFilter === "custom" && (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Start Month</label>
                <input
                  type="month"
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">End Month</label>
                <input
                  type="month"
                  value={endMonth}
                  onChange={(e) => setEndMonth(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Result</label>
            <select
              value={resultFilter}
              onChange={(e) => setResultFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All</option>
              <option value="profit">Profit</option>
              <option value="loss">Loss</option>
              <option value="breakeven">Break Even</option>
            </select>
          </div>

          <div className="flex-1">
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Search</label>
            <input
              type="text"
              placeholder="Search by month (e.g. March 2026)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full md:w-80 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm text-slate-500">Total Revenue</div>
          <div className="text-2xl font-bold text-emerald-600">{mmkFormatter.format(totals.revenue)}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm text-slate-500">Total Expense</div>
          <div className="text-2xl font-bold text-rose-600">{mmkFormatter.format(totals.expense)}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm text-slate-500">Total Profit</div>
          <div className="text-2xl font-bold text-emerald-600">{mmkFormatter.format(totals.profit)}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm text-slate-500">Total Loss</div>
          <div className="text-2xl font-bold text-rose-600">{mmkFormatter.format(totals.loss)}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm text-slate-500">Net</div>
          <div className={`text-2xl font-bold ${totals.net >= 0 ? "text-indigo-600" : "text-rose-600"}`}>
            {mmkFormatter.format(totals.net)}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Month</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">Revenue</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">Expense</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">Profit</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">Loss</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">Net</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">MoM %</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700">Result</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">Loading...</td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">No report data found</td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.month} className="border-t border-slate-100 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition">
                  <td className="px-4 py-3 font-medium text-slate-800">{formatMonthLabel(row.month)}</td>
                  <td className="px-4 py-3 text-right text-emerald-700 font-medium">{mmkFormatter.format(row.revenue)}</td>
                  <td className="px-4 py-3 text-right text-rose-700 font-medium">{mmkFormatter.format(row.expense)}</td>
                  <td className="px-4 py-3 text-right text-emerald-700 font-medium">{mmkFormatter.format(row.profit)}</td>
                  <td className="px-4 py-3 text-right text-rose-700 font-medium">{mmkFormatter.format(row.loss)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${row.net >= 0 ? "text-indigo-700" : "text-rose-700"}`}>
                    {mmkFormatter.format(row.net)}
                  </td>
                  <td className={`px-4 py-3 text-right font-medium ${row.changePct == null ? "text-slate-500" : row.changePct >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {row.changePct == null ? "-" : `${row.changePct.toFixed(2)}%`}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${badgeClass(row.result)}`}>
                      {row.result}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
