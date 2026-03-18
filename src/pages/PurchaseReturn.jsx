import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function PurchaseReturn({ setInventory }) {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [purchaseItems, setPurchaseItems] = useState([]);
  const [returnItems, setReturnItems] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const user = JSON.parse(localStorage.getItem("user"));
  const canManage = user?.role === "superadmin" || user?.role === "admin";

  const formatMMK = (amount) => {
    const num = Number(amount) || 0;
    return new Intl.NumberFormat("my-MM", { style: "currency", currency: "MMK", maximumFractionDigits: 0 }).format(num);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [purchasesRes, suppliersRes] = await Promise.all([
        supabase.from("purchases").select("*").eq("status", "received").order("created_at", { ascending: false }),
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

  const filteredPurchases = purchases.filter((p) => {
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

  const checkReturnStatus = async (purchase) => {
    const { data: items } = await supabase.from("purchase_items").select("*").eq("purchase_id", purchase.id);
    const { data: inventory } = await supabase.from("inventory").select("item_name, qty");

    let allReturned = true;
    for (const item of items) {
      const invItem = inventory?.find(i => i.item_name.toLowerCase() === item.item_name.toLowerCase());
      const currentQty = invItem ? invItem.qty : 0;
      if (currentQty > 0) {
        allReturned = false;
        break;
      }
    }
    return allReturned;
  };

  const viewDetails = async (purchase) => {
    const { data: items } = await supabase.from("purchase_items").select("*").eq("purchase_id", purchase.id).order("id", { ascending: true });
    setSelectedPurchase(purchase);
    setPurchaseItems(items || []);
    setShowDetailModal(true);
  };

  const openReturnModal = async (purchase) => {
    const { data: items } = await supabase.from("purchase_items").select("*").eq("purchase_id", purchase.id);
    const { data: inventory } = await supabase.from("inventory").select("item_name, qty");

    setSelectedPurchase(purchase);
    setPurchaseItems(items || []);

    // Calculate remaining qty based on inventory
    setReturnItems((items || []).map(item => {
      const invItem = inventory?.find(i => i.item_name.toLowerCase() === item.item_name.toLowerCase());
      const currentInventoryQty = invItem ? invItem.qty : 0;
      const maxReturnable = Math.min(item.qty, currentInventoryQty);
      return {
        ...item,
        max_qty: maxReturnable,
        return_qty: 0,
        selected: false
      };
    }));

    setShowModal(true);
  };

  const toggleItemSelection = (id) => {
    setReturnItems(returnItems.map(item => {
      if (item.id === id) {
        return { ...item, selected: !item.selected, return_qty: !item.selected ? item.max_qty : 0 };
      }
      return item;
    }));
  };

  const selectAllItems = () => {
    const allSelected = returnItems.every(item => item.selected);
    if (allSelected) {
      // Deselect all
      setReturnItems(returnItems.map(item => ({ ...item, selected: false, return_qty: 0 })));
    } else {
      // Select all with max qty
      setReturnItems(returnItems.map(item => ({ ...item, selected: true, return_qty: item.max_qty })));
    }
  };

  const updateReturnQty = (id, qty) => {
    const item = returnItems.find(p => p.id === id);
    const maxQty = item?.max_qty || 0;
    const val = Math.min(Math.max(0, parseFloat(qty) || 0), maxQty);
    setReturnItems(returnItems.map(item => {
      if (item.id === id) {
        return { ...item, return_qty: val, selected: val > 0 };
      }
      return item;
    }));
  };

  const calculateReturnTotal = () => {
    return returnItems.reduce((sum, item) => sum + (parseFloat(item.return_qty) || 0) * (parseFloat(item.unit_price) || 0), 0).toFixed(2);
  };

  const handleReturn = async () => {
    const itemsToReturn = returnItems.filter(item => item.selected && item.return_qty > 0);

    if (itemsToReturn.length === 0) {
      return Swal.fire("Error", "Please select at least one item to return", "error");
    }

    const result = await Swal.fire({
      title: "Process Return?",
      text: "This will reduce inventory quantity. This action cannot be undone.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Process Return",
      cancelButtonText: "Cancel"
    });

    if (result.isConfirmed) {
      try {
        // Reduce inventory for each returned item
        for (const item of itemsToReturn) {
          const { data: existing } = await supabase
            .from("inventory")
            .select("*")
            .ilike("item_name", item.item_name.trim())
            .maybeSingle();

          if (existing) {
            const newQty = Math.max(0, existing.qty - item.return_qty);
            await supabase.from("inventory").update({ qty: newQty }).eq("id", existing.id);
          }
        }

        // Check if all items fully returned
        const { data: updatedItems } = await supabase.from("purchase_items").select("*").eq("purchase_id", selectedPurchase.id);
        const { data: inventory } = await supabase.from("inventory").select("item_name, qty");

        let allReturned = true;
        for (const item of updatedItems) {
          const invItem = inventory?.find(i => i.item_name.toLowerCase() === item.item_name.toLowerCase());
          const currentQty = invItem ? invItem.qty : 0;
          if (currentQty > 0) {
            allReturned = false;
            break;
          }
        }

        // Update purchase status if fully returned
        if (allReturned) {
          await supabase.from("purchases").update({ status: "returned" }).eq("id", selectedPurchase.id);
        }

        Swal.fire("Success", "Return processed and inventory updated!", "success");
        setShowModal(false);
        fetchData();

        if (setInventory) {
          const { data } = await supabase.from("inventory").select("*").order("id", { ascending: true });
          setInventory(data || []);
        }
      } catch (err) {
        console.error("Error:", err);
        Swal.fire("Error", err.message || "Failed to process return", "error");
      }
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      received: "bg-emerald-100 text-emerald-700",
      returned: "bg-violet-100 text-violet-700"
    };
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.received}`}>{status}</span>;
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Purchase Return</h1>
          <p className="text-sm text-slate-500 mt-1">Process returns for completed purchases</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <input type="text" placeholder="Search by invoice number or supplier..." value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          className="w-full md:w-96 px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>

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
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No completed purchases found</td></tr>
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
                  <td className="px-4 py-3 text-center">{getStatusBadge(purchase.status)}</td>
                  <td className="px-4 py-3 text-center">
                    {purchase.status !== "returned" && canManage && (
                      <button onClick={() => openReturnModal(purchase)}
                        className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700">
                        Return
                      </button>
                    )}
                    {purchase.status === "returned" && <span className="text-slate-400 text-sm">Returned</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
              <h3 className="text-xl font-bold text-slate-800">Purchase Details</h3>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">X</button>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">Invoice #:</span><span className="ml-2 font-semibold">{selectedPurchase?.invoice_number}</span></div>
              <div><span className="text-slate-500">Date:</span><span className="ml-2">{selectedPurchase?.date}</span></div>
              <div><span className="text-slate-500">Supplier:</span><span className="ml-2">{getSupplierName(selectedPurchase?.supplier_id)}</span></div>
              <div><span className="text-slate-500">Status:</span><span className="ml-2">{getStatusBadge(selectedPurchase?.status)}</span></div>
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
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Close</button>
              {selectedPurchase?.status !== "returned" && canManage && (
                <button onClick={() => { setShowDetailModal(false); openReturnModal(selectedPurchase); }}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
                  Process Return
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Return Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 overflow-y-auto py-8">
          <div className="bg-white rounded-xl p-6 w-full max-w-3xl shadow-xl mx-4">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xl font-bold text-slate-800">Process Return</h3>
              <button onClick={selectAllItems}
                className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
                {returnItems.every(item => item.selected) ? "Deselect All" : "Select All"}
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">Invoice #:</span><span className="ml-2 font-semibold">{selectedPurchase?.invoice_number}</span></div>
              <div><span className="text-slate-500">Date:</span><span className="ml-2">{selectedPurchase?.date}</span></div>
              <div><span className="text-slate-500">Supplier:</span><span className="ml-2">{getSupplierName(selectedPurchase?.supplier_id)}</span></div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700 w-12">
                      <input type="checkbox" checked={returnItems.every(item => item.selected)} onChange={selectAllItems}
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500" />
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Item</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Unit</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Original Qty</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Return Qty</th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700">Unit Price</th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {returnItems.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-4 py-2 text-center">
                        <input type="checkbox" checked={item.selected} onChange={() => toggleItemSelection(item.id)}
                          className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500" />
                      </td>
                      <td className="px-4 py-2 text-slate-800">{item.item_name}</td>
                      <td className="px-4 py-2 text-center text-slate-600">{item.type || "-"}</td>
                      <td className="px-4 py-2 text-center text-slate-600">{item.qty}</td>
                      <td className="px-4 py-2">
                        <input type="number" value={item.return_qty} onChange={(e) => updateReturnQty(item.id, e.target.value)}
                          min="0" max={item.max_qty} step="1" disabled={!item.selected}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm text-center focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400" />
                        <span className="text-xs text-slate-400">Max: {item.max_qty}</span>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-600">{formatMMK(item.unit_price)}</td>
                      <td className="px-4 py-2 text-right font-medium text-slate-800">{formatMMK((item.return_qty || 0) * item.unit_price)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr>
                    <td colSpan={6} className="px-4 py-2 text-right font-bold text-slate-800">Return Total</td>
                    <td className="px-4 py-2 text-right font-bold text-amber-600">{formatMMK(calculateReturnTotal())}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleReturn}
                className="px-5 py-2.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">Process Return</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}