import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function PurchaseReturnReport() {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [purchaseItems, setPurchaseItems] = useState([]);

  // Filter states
  const [filterType, setFilterType] = useState("all"); // all, today, month, year, custom
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

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

      // Filter only returned purchases
      const returnedPurchases = (purchasesRes.data || []).filter(p => p.status === "returned");
      setPurchases(returnedPurchases);

      if (!suppliersRes.error) setSuppliers(suppliersRes.data || []);
    } catch (err) {
      console.error("Error fetching data:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Get today's date
  const today = new Date().toISOString().split("T")[0];

  // Filter by date
  const filteredByDate = purchases.filter(p => {
    if (filterType === "all") return true;

    const purchaseDate = p.date;

    if (filterType === "today") {
      return purchaseDate === today;
    }

    if (filterType === "month") {
      const currentMonth = today.substring(0, 7); // YYYY-MM
      return purchaseDate.substring(0, 7) === currentMonth;
    }

    if (filterType === "year") {
      const currentYear = today.substring(0, 4); // YYYY
      return purchaseDate.substring(0, 4) === currentYear;
    }

    if (filterType === "custom" && startDate && endDate) {
      return purchaseDate >= startDate && purchaseDate <= endDate;
    }

    return true;
  });

  // Filter by search
  const filteredPurchases = filteredByDate.filter(p => {
    const matchesSearch = p.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getSupplierName(p.supplier_id)?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const totalPages = Math.ceil(filteredPurchases.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedPurchases = filteredPurchases.slice(startIndex, startIndex + itemsPerPage);

  const getSupplierName = (supplierId) => {
    if (!supplierId) return "-";
    const sup = suppliers.find((s) => s.id === supplierId);
    return sup ? sup.name : "-";
  };

  const viewDetails = async (purchase) => {
    const { data: items } = await supabase.from("purchase_items").select("*").eq("purchase_id", purchase.id).order("id", { ascending: true });
    setSelectedPurchase(purchase);
    setPurchaseItems(items || []);
    setShowDetailModal(true);
  };

  // Export to Excel
  const exportToExcel = () => {
    const exportData = filteredPurchases.map(p => ({
      "Invoice #": p.invoice_number,
      "Date": p.date,
      "Supplier": getSupplierName(p.supplier_id),
      "Total Amount": p.total_amount,
      "Discount (%)": p.discount || 0,
      "Status": p.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Purchase Returns");

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });

    const fileData = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    saveAs(fileData, `Purchase_Returns_${today}.xlsx`);
  };

  // Calculate totals
  const totalReturnAmount = filteredPurchases.reduce((sum, p) => sum + (parseFloat(p.total_amount) || 0), 0);
  const totalCount = filteredPurchases.length;

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Purchase Return Report</h1>
          <p className="text-sm text-slate-500 mt-1">View purchase return reports</p>
        </div>
        <button
          onClick={exportToExcel}
          className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
        >
          Export Excel
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Filter</label>
            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All</option>
              <option value="today">Today</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {filterType === "custom" && (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </>
          )}

          <div className="flex-1">
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Search</label>
            <input
              type="text"
              placeholder="Search by invoice or supplier..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full md:w-64 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm text-slate-500">Total Returns</div>
          <div className="text-2xl font-bold text-slate-800">{totalCount}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm text-slate-500">Total Return Amount</div>
          <div className="text-2xl font-bold text-rose-600">{formatMMK(totalReturnAmount)}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm text-slate-500">Average Return</div>
          <div className="text-2xl font-bold text-slate-800">{totalCount > 0 ? formatMMK(totalReturnAmount / totalCount) : formatMMK(0)}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Invoice #</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Supplier</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">Total</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700">Status</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>
            ) : filteredPurchases.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No return records found</td></tr>
            ) : (
              paginatedPurchases.map((purchase) => (
                <tr key={purchase.id} className="border-t border-slate-100 hover:bg-indigo-50/50">
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    <button onClick={() => viewDetails(purchase)} className="text-indigo-600 hover:text-indigo-800 underline">
                      {purchase.invoice_number}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{purchase.date}</td>
                  <td className="px-4 py-3 text-slate-600">{getSupplierName(purchase.supplier_id)}</td>
                  <td className="px-4 py-3 text-right text-slate-600 font-medium">{formatMMK(purchase.total_amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
                      {purchase.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => viewDetails(purchase)} className="text-indigo-600 hover:text-indigo-800 font-medium">
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center mt-6 gap-2">
          <button onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 disabled:opacity-50 hover:bg-slate-100">Previous</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button key={page} onClick={() => setCurrentPage(page)}
              className={`px-3 py-1.5 border rounded-lg text-sm font-medium ${currentPage === page ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}>{page}</button>
          ))}
          <button onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 disabled:opacity-50 hover:bg-slate-100">Next</button>
        </div>
      )}

      {/* Details Modal */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-800">Return Details</h3>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">X</button>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">Invoice #:</span><span className="ml-2 font-semibold">{selectedPurchase?.invoice_number}</span></div>
              <div><span className="text-slate-500">Date:</span><span className="ml-2">{selectedPurchase?.date}</span></div>
              <div><span className="text-slate-500">Supplier:</span><span className="ml-2">{getSupplierName(selectedPurchase?.supplier_id)}</span></div>
              <div><span className="text-slate-500">Status:</span><span className="ml-2"><span className="px-2 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700">{selectedPurchase?.status}</span></span></div>
              {selectedPurchase?.discount > 0 && (
                <div><span className="text-slate-500">Discount:</span><span className="ml-2 text-red-600">{selectedPurchase?.discount}%</span></div>
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
                  {purchaseItems.map((item, idx) => (
                    <tr key={idx} className="border-t border-slate-100">
                      <td className="px-4 py-2 text-slate-800">{item.item_name}</td>
                      <td className="px-4 py-2 text-center text-slate-600">{item.qty}</td>
                      <td className="px-4 py-2 text-center text-slate-600">{item.type || "-"}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{formatMMK(item.unit_price)}</td>
                      <td className="px-4 py-2 text-right font-medium text-slate-800">{formatMMK(item.total_price)}</td>
                    </tr>
                  ))}
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
            <div className="flex justify-end mt-4">
              <button onClick={() => setShowDetailModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}