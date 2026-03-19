import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import supabase from "../createClients";

export default function SupplierOutstanding() {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedSuppliers, setExpandedSuppliers] = useState({});

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

  // Calculate supplier outstanding (Credit purchases that are not received/cancelled)
  const supplierOutstanding = () => {
    const creditPurchases = purchases.filter(p =>
      p.payment_type === "Credit" && p.status !== "cancelled" && p.status !== "received"
    );
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
        <input
          type="text"
          placeholder="Search by supplier name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full md:w-64 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm text-slate-500">Total Suppliers</div>
          <div className="text-2xl font-bold text-slate-800">{filteredData.length}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm text-slate-500">Total Pending Orders</div>
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
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>
            ) : filteredData.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No outstanding credit purchases</td></tr>
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
                  {expandedSuppliers[sup.supplier_id] && sup.purchases.map((p) => (
                    <tr key={p.id} className="bg-slate-50 border-t border-slate-200">
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2 pl-10 text-slate-600">
                        <span className="font-medium">{p.invoice_number}</span>
                        <span className="ml-2 text-slate-400">| {p.date}</span>
                      </td>
                      <td className="px-4 py-2 text-center text-slate-600">{p.credit_option || "-"}</td>
                      <td className="px-4 py-2 text-right font-medium text-slate-700">{formatMMK(p.total_amount)}</td>
                    </tr>
                  ))}
                </>
              ))
            )}
          </tbody>
          {filteredData.length > 0 && (
            <tfoot className="bg-slate-50">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-right font-bold text-slate-800">Total Outstanding</td>
                <td className="px-4 py-3 text-right font-bold text-indigo-600">{formatMMK(totalOutstanding)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}