import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function SupplierOutstanding() {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedSuppliers, setExpandedSuppliers] = useState({});
  const [dateFilter, setDateFilter] = useState("all");
  const [customDateRange, setCustomDateRange] = useState({ start: "", end: "" });
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [selectedPurchaseItems, setSelectedPurchaseItems] = useState([]);

  const formatMMK = (amount) => {
    const num = Number(amount) || 0;
    return new Intl.NumberFormat("my-MM", { style: "currency", currency: "MMK", maximumFractionDigits: 0 }).format(num);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [purchasesRes, suppliersRes] = await Promise.all([
        supabase.from("purchases").select("*").order("created_at", { ascending: false }),
        supabase.from("suppliers").select("*").order("name", { ascending: true })
      ]);

      if (!purchasesRes.error) setPurchases(purchasesRes.data || []);
      if (!suppliersRes.error) setSuppliers(suppliersRes.data || []);
    } catch (err) {
      console.error("Error fetching data:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getSupplierName = (supplierId) => {
    if (!supplierId) return "-";
    const sup = suppliers.find((s) => s.id === supplierId);
    return sup ? sup.name : "-";
  };

  // Calculate supplier outstanding (Credit purchases - pending or received but not paid)
  const supplierOutstanding = () => {
    const creditPurchases = purchases.filter(p => {
      // Date filter
      let matchesDate = true;
      if (dateFilter !== "all" && p.date) {
        const purchaseDate = new Date(p.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dateFilter === "day") {
          const dayStart = new Date(today);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(today);
          dayEnd.setHours(23, 59, 59, 999);
          matchesDate = purchaseDate >= dayStart && purchaseDate <= dayEnd;
        } else if (dateFilter === "week") {
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay());
          weekStart.setHours(0, 0, 0, 0);
          matchesDate = purchaseDate >= weekStart;
        } else if (dateFilter === "month") {
          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
          matchesDate = purchaseDate >= monthStart;
        } else if (dateFilter === "year") {
          const yearStart = new Date(today.getFullYear(), 0, 1);
          matchesDate = purchaseDate >= yearStart;
        } else if (dateFilter === "custom" && customDateRange.start && customDateRange.end) {
          const start = new Date(customDateRange.start);
          const end = new Date(customDateRange.end);
          end.setHours(23, 59, 59, 999);
          matchesDate = purchaseDate >= start && purchaseDate <= end;
        }
      }

      return matchesDate && p.payment_type === "Credit" && p.status !== "cancelled" && !p.paid;
    });

    const supplierData = {};

    creditPurchases.forEach(p => {
      const supId = p.supplier_id;
      if (!supplierData[supId]) {
        supplierData[supId] = { name: getSupplierName(supId), total: 0, count: 0, purchases: [] };
      }
      supplierData[supId].total += parseFloat(p.total_amount) || 0;
      supplierData[supId].count += 1;
      supplierData[supId].purchases.push(p);
    });

    return Object.entries(supplierData)
      .map(([id, data]) => ({
        supplier_id: parseInt(id),
        supplier_name: data.name,
        total_payable: data.total,
        purchase_count: data.count,
        purchases: data.purchases
      }))
      .sort((a, b) => b.total_payable - a.total_payable);
  };

  const outstandingData = supplierOutstanding();

  const filteredData = outstandingData.filter(s =>
    s.supplier_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalOutstanding = filteredData.reduce((sum, s) => sum + s.total_payable, 0);

  const toggleExpand = (supplierId) => {
    setExpandedSuppliers(prev => ({
      ...prev,
      [supplierId]: !prev[supplierId]
    }));
  };

  const viewDetails = async (purchase) => {
    const { data: items } = await supabase.from("purchase_items").select("*").eq("purchase_id", purchase.id).order("id", { ascending: true });
    setSelectedPurchase(purchase);
    setSelectedPurchaseItems(items || []);
    setShowDetailModal(true);
  };

  const handlePay = async (purchase) => {
    const result = await Swal.fire({
      title: "Pay Invoice?",
      text: `Mark invoice ${purchase.invoice_number} as paid?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Pay",
      cancelButtonText: "Cancel"
    });

    if (result.isConfirmed) {
      try {
        await supabase.from("purchases").update({ status: "received", paid: true }).eq("id", purchase.id);
        Swal.fire("Success", "Invoice marked as paid!", "success");
        fetchData();
      } catch (err) {
        console.error("Error:", err);
        Swal.fire("Error", err.message || "Failed to process payment", "error");
      }
    }
  };

  const exportToExcel = () => {
    const exportData = [];
    filteredData.forEach(s => {
      s.purchases.forEach(p => {
        exportData.push({
          "Supplier Name": s.supplier_name,
          "Invoice #": p.invoice_number,
          "Date": p.date,
          "Payment Term": p.credit_option || "-",
          "Amount": p.total_amount
        });
      });
      exportData.push({
        "Supplier Name": s.supplier_name + " (Total)",
        "Invoice #": "-",
        "Date": "-",
        "Payment Term": "-",
        "Amount": s.total_payable
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Supplier Outstanding");

    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const fileData = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const today = new Date().toISOString().split("T")[0];
    saveAs(fileData, `Supplier_Outstanding_${today}.xlsx`);
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Supplier Outstanding</h1>
          <p className="text-sm text-slate-500 mt-1">Credit purchases pending payment</p>
        </div>
        <button
          onClick={exportToExcel}
          className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
        >
          Export Excel
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <input
            type="text"
            placeholder="Search by supplier name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full md:w-64 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="all">All Time</option>
            <option value="day">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
            <option value="custom">Custom Date</option>
          </select>
          {dateFilter === "custom" && (
            <div className="flex gap-2">
              <input type="date" value={customDateRange.start} onChange={(e) => setCustomDateRange({ ...customDateRange, start: e.target.value })}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <input type="date" value={customDateRange.end} onChange={(e) => setCustomDateRange({ ...customDateRange, end: e.target.value })}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm text-slate-500">Total Suppliers</div>
          <div className="text-2xl font-bold text-slate-800">{filteredData.length}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm text-slate-500">Total Pending Payments</div>
          <div className="text-2xl font-bold text-amber-600">{filteredData.reduce((sum, s) => sum + s.purchase_count, 0)}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm text-slate-500">Total Outstanding</div>
          <div className="text-2xl font-bold text-indigo-600">{formatMMK(totalOutstanding)}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 w-10"></th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Supplier Name</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700">Pending Orders</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">Total Payable</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>
            ) : filteredData.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No outstanding credit purchases</td></tr>
            ) : (
              filteredData.map((sup) => (
                <>
                  <tr key={sup.supplier_id} className="border-t border-slate-100 hover:bg-indigo-50/50">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleExpand(sup.supplier_id)}
                        className="text-indigo-600 hover:text-indigo-800"
                      >
                        {expandedSuppliers[sup.supplier_id] ? "−" : "+"}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{sup.supplier_name}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{sup.purchase_count}</td>
                    <td className="px-4 py-3 text-right font-bold text-amber-600">{formatMMK(sup.total_payable)}</td>
                  </tr>
                  {expandedSuppliers[sup.supplier_id] && sup.purchases.filter(p => !p.paid).map((p) => (
                    <tr key={p.id} className="bg-slate-50 border-t border-slate-200">
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2 pl-10 text-slate-600">
                        <button onClick={() => viewDetails(p)} className="font-medium text-indigo-600 hover:text-indigo-800 underline">{p.invoice_number}</button>
                        <span className="ml-2 text-slate-400">| {p.date}</span>
                      </td>
                      <td className="px-4 py-2 text-center text-slate-600">{p.credit_option || "-"}</td>
                      <td className="px-4 py-2 text-right font-medium text-slate-700">{formatMMK(p.total_amount)}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => handlePay(p)}
                          className="px-2 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
                        >
                          Pay
                        </button>
                      </td>
                    </tr>
                  ))}
                </>
              ))
            )}
          </tbody>
          {filteredData.length > 0 && (
            <tfoot className="bg-slate-50">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-right font-bold text-slate-800">Total Outstanding</td>
                <td className="px-4 py-3 text-right font-bold text-indigo-600">{formatMMK(totalOutstanding)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Details Modal */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-800">Purchase Details</h3>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">X</button>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">Invoice #:</span><span className="ml-2 font-semibold">{selectedPurchase?.invoice_number}</span></div>
              <div><span className="text-slate-500">Date:</span><span className="ml-2">{selectedPurchase?.date}</span></div>
              <div><span className="text-slate-500">Supplier:</span><span className="ml-2">{getSupplierName(selectedPurchase?.supplier_id)}</span></div>
              <div><span className="text-slate-500">Status:</span><span className="ml-2">{selectedPurchase?.status}</span></div>
              {selectedPurchase?.discount > 0 && (
                <div><span className="text-slate-500">Discount:</span><span className="ml-2 text-red-600">{selectedPurchase?.discount}%</span></div>
              )}
              {selectedPurchase?.tax > 0 && (
                <div><span className="text-slate-500">Tax:</span><span className="ml-2 text-blue-600">{selectedPurchase?.tax}%</span></div>
              )}
              <div><span className="text-slate-500">Payment:</span><span className="ml-2 font-medium">{selectedPurchase?.payment_type || "Cash Down"}</span></div>
              {selectedPurchase?.payment_type === "Credit" && selectedPurchase?.credit_option && (
                <div><span className="text-slate-500">Credit:</span><span className="ml-2 font-medium">{selectedPurchase?.credit_option}</span></div>
              )}
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Item</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Qty</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Unit</th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700">Unit Price</th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPurchaseItems.length > 0 ? selectedPurchaseItems.map((item, idx) => (
                    <tr key={idx} className="border-t border-slate-100">
                      <td className="px-4 py-2 text-slate-800">{item.item_name}</td>
                      <td className="px-4 py-2 text-center text-slate-600">{item.qty}</td>
                      <td className="px-4 py-2 text-center text-slate-600">{item.type || "-"}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{formatMMK(item.unit_price)}</td>
                      <td className="px-4 py-2 text-right font-medium text-slate-800">{formatMMK(item.total_price)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} className="px-4 py-4 text-center text-slate-500">No items found</td></tr>
                  )}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr>
                    <td colSpan={4} className="px-4 py-2 text-right font-bold text-slate-800">Grand Total</td>
                    <td className="px-4 py-2 text-right font-bold text-indigo-600">{formatMMK(selectedPurchase?.total_amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {selectedPurchase?.notes && <div className="mt-4 text-sm"><span className="text-slate-500">Notes:</span><p className="text-slate-700 mt-1">{selectedPurchase.notes}</p></div>}
          </div>
        </div>
      )}
    </div>
  );
}