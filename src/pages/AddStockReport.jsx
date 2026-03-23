import { useState, useEffect, useMemo } from "react";
import supabase from "../createClients";

export default function AddStockReport() {
  const [records, setRecords] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [recordSearch, setRecordSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const user = JSON.parse(localStorage.getItem("user"));

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [recordsRes, inventoryRes] = await Promise.all([
        supabase.from("internal_consumption").select("*").eq("status", "add_stock").order("created_at", { ascending: false }),
        supabase.from("inventory").select("*")
      ]);
      setRecords(recordsRes.data || []);
      setInventory(inventoryRes.data || []);
    } catch (err) {
      console.error("Error:", err);
    }
    setLoading(false);
  };

  const filteredRecords = useMemo(() => {
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
      endDate.setHours(23, 59, 59);
    }

    return records.filter((record) => {
      const recordDate = new Date(record.created_at);
      if (startDate && recordDate < startDate) return false;
      if (endDate && recordDate > endDate) return false;

      if (recordSearch) {
        const searchLower = recordSearch.toLowerCase();
        const matchesId = record.id.toString().includes(searchLower);
        const matchesUser = record.user_name?.toLowerCase().includes(searchLower);
        const matchesNotes = record.notes?.toLowerCase().includes(searchLower);
        if (!matchesId && !matchesUser && !matchesNotes) return false;
      }

      return true;
    });
  }, [records, dateFilter, customStart, customEnd, recordSearch]);

  const [expandedRecords, setExpandedRecords] = useState({});
  const [recordItems, setRecordItems] = useState({});

  const toggleRecord = async (recordId) => {
    if (expandedRecords[recordId]) {
      setExpandedRecords(prev => ({ ...prev, [recordId]: false }));
    } else {
      const { data } = await supabase.from("internal_consumption_items").select("*").eq("consumption_id", recordId);
      setRecordItems(prev => ({ ...prev, [recordId]: data || [] }));
      setExpandedRecords(prev => ({ ...prev, [recordId]: true }));
    }
  };

  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredRecords.slice(start, start + itemsPerPage);
  }, [filteredRecords, currentPage]);

  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);

  const exportToExcel = async () => {
    const reportData = [];
    for (const record of filteredRecords) {
      const items = await supabase.from("internal_consumption_items").select("*").eq("consumption_id", record.id);
      for (const item of items.data || []) {
        const inv = inventory.find((i) => i.id === item.inventory_id);
        const beforeQty = inv ? inv.qty - item.qty : item.qty;
        const afterQty = inv ? inv.qty : item.qty;
        reportData.push({
          Date: new Date(record.created_at).toLocaleDateString(),
          "Record ID": record.id,
          "Item Name": inv?.item_name || "Unknown",
          "Before Qty": beforeQty,
          "Added Qty": item.qty,
          "Closing Qty": afterQty,
          Unit: inv?.type || "-",
          "User Name": record.user_name || user?.email || "Unknown",
          Notes: record.notes || "-",
        });
      }
    }

    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"></head><body>
<table border="1">
<tr style="background:#ddd;font-weight:bold;">
<td>Date</td><td>Record ID</td><td>Item Name</td><td>Before Qty</td><td>Added Qty</td><td>After Qty</td><td>Unit</td><td>User Name</td><td>Notes</td>
</tr>
${reportData.map(row =>
  `<tr>
  <td>${row.Date}</td>
  <td>${row["Record ID"]}</td>
  <td>${row["Item Name"]}</td>
  <td>${row["Before Qty"]}</td>
  <td>${row["Added Qty"]}</td>
  <td>${row["After Qty"]}</td>
  <td>${row.Unit}</td>
  <td>${row["User Name"]}</td>
  <td>${row.Notes}</td>
  </tr>`
).join("")}
</table></body></html>`;

    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `add_stock_report_${new Date().toISOString().split("T")[0]}.xls`;
    link.click();
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Add Stock Report</h1>
          <p className="text-sm text-slate-500 mt-1">View all stock additions</p>
        </div>
        <button
          onClick={exportToExcel}
          className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
        >
          Export Excel
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Search records..."
              value={recordSearch}
              onChange={(e) => { setRecordSearch(e.target.value); setCurrentPage(1); }}
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
          <div className="ml-auto text-sm text-gray-600">
            Showing {filteredRecords.length} record(s)
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10">Loading...</div>
      ) : filteredRecords.length === 0 ? (
        <div className="text-center py-10 text-slate-500">No add stock records found</div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-4 py-3 w-10"></th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Record ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">User</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Notes</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRecords.map((record) => (
                  <>
                    <tr key={record.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleRecord(record.id)}
                          className="text-indigo-600 hover:text-indigo-800 font-bold"
                        >
                          {expandedRecords[record.id] ? "−" : "+"}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">#{record.id}</td>
                      <td className="px-4 py-3 text-slate-600">{new Date(record.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-600">{record.user_name || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{record.notes || "-"}</td>
                    </tr>
                    {expandedRecords[record.id] && (
                      <tr className="bg-slate-50">
                        <td colSpan={5} className="px-4 py-3">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left border-b">
                                <th className="pb-2">Item Name</th>
                                <th className="pb-2">Before Qty</th>
                                <th className="pb-2">Added Qty</th>
                                <th className="pb-2">Closing Qty</th>
                                <th className="pb-2">Unit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(recordItems[record.id] || []).map((item, idx) => {
                                const inv = inventory.find((i) => i.id === item.inventory_id);
                                const beforeQty = inv ? inv.qty - item.qty : item.qty;
                                const afterQty = inv ? inv.qty : item.qty;
                                return (
                                  <tr key={idx} className="border-t">
                                    <td className="py-2">{inv?.item_name || `Item ID: ${item.inventory_id}`}</td>
                                    <td className="py-2">{beforeQty}</td>
                                    <td className="py-2 text-green-600 font-medium">+{item.qty}</td>
                                    <td className="py-2 font-medium">{afterQty}</td>
                                    <td className="py-2">{inv?.type || "-"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-6">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-200 rounded-lg disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-sm">Page {currentPage} of {totalPages}</span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-gray-200 rounded-lg disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
