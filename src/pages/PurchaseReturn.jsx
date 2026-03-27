import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function PurchaseReturn({ setInventory }) {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allReceivedPurchases, setAllReceivedPurchases] = useState([]);

  // Invoice search modal
  const [showInvoiceSearchModal, setShowInvoiceSearchModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  // Multi-invoice return list
  const [returnList, setReturnList] = useState([]);
  const [showReturnListModal, setShowReturnListModal] = useState(false);

  // Saved returns history
  const [savedReturns, setSavedReturns] = useState([]);
  const [selectedReturnItems, setSelectedReturnItems] = useState([]);
  const [showReturnItemsModal, setShowReturnItemsModal] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [editingReturnId, setEditingReturnId] = useState(null);

  // Pagination for saved returns
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const user = JSON.parse(localStorage.getItem("user"));

  const formatMMK = (amount) => {
    const num = Number(amount) || 0;
    return new Intl.NumberFormat("my-MM", { style: "currency", currency: "MMK", maximumFractionDigits: 0 }).format(num);
  };

  const getSupplierName = (supplierId) => {
    if (!supplierId) return "-";
    const sup = suppliers.find((s) => s.id === supplierId);
    return sup ? sup.name : "-";
  };

  const fetchSavedReturns = async () => {
    const { data } = await supabase.from("purchase_returns").select("*").order("created_at", { ascending: false });
    setSavedReturns(data || []);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [suppliersRes, purchasesRes] = await Promise.all([
        supabase.from("suppliers").select("*").order("name", { ascending: true }),
        supabase.from("purchases").select("*").order("created_at", { ascending: false })
      ]);
      if (!suppliersRes.error) setSuppliers(suppliersRes.data || []);

      // Filter received purchases (case-insensitive)
      if (!purchasesRes.error) {
        const received = (purchasesRes.data || []).filter(
          p => (p.status || "").toLowerCase() === "received"
        );
        setAllReceivedPurchases(received);
      }

      await fetchSavedReturns();
    } catch (err) {
      console.error("Error fetching data:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Search invoice by number inside modal
  const handleSearch = () => {
    if (!searchTerm.trim()) {
      setSearchResults(allReceivedPurchases);
      return;
    }

    const filtered = allReceivedPurchases.filter(p =>
      p.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setSearchResults(filtered);
    if (filtered.length === 0 && allReceivedPurchases.length === 0) {
      Swal.fire("Info", "No received purchases found. Please complete some purchases first.", "info");
    }
  };

  // Clear search and close modal
  const closeInvoiceSearchModal = () => {
    setShowInvoiceSearchModal(false);
    setSearchTerm("");
    setSearchResults([]);
    setEditingReturnId(null);
  };

  // Open modal and show all received invoices
  const openInvoiceSearchModal = () => {
    setSearchTerm("");
    setSearchResults(allReceivedPurchases);
    if (editingReturnId) {
      // Get current return items count
      const ret = savedReturns.find(r => r.id === editingReturnId);
      setEditingReturnItemsCount(ret?.items_count || 0);
    }
    setShowInvoiceSearchModal(true);
  };

  // View items from an invoice and add to return list
  const viewInvoiceItems = async (purchase) => {
    const { data: items } = await supabase
      .from("purchase_items")
      .select("*")
      .eq("purchase_id", purchase.id)
      .order("id", { ascending: true });

    const { data: inventory } = await supabase
      .from("inventory")
      .select("item_name, qty");

    const itemsWithQty = (items || []).map(item => {
      const invItem = inventory?.find(i => i.item_name.toLowerCase() === item.item_name.toLowerCase());
      const currentInventoryQty = invItem ? invItem.qty : 0;
      return {
        ...item,
        invoice_number: purchase.invoice_number,
        purchase_id: purchase.id,
        purchase_item_id: item.id, // Store the purchase_items row ID for direct lookup
        purchase_date: purchase.date,
        supplier_name: getSupplierName(purchase.supplier_id),
        current_inventory_qty: currentInventoryQty,
        return_qty: 0
      };
    });

    // Add to return list
    setReturnList(prev => {
      const existingIds = new Set(prev.map(i => i.id));
      const newItems = itemsWithQty.filter(i => !existingIds.has(i.id));
      return [...prev, ...newItems];
    });

    setShowReturnListModal(true);
  };

  // Update return qty in return list
  const updateReturnQty = (id, qty) => {
    const item = returnList.find(i => i.id === id);
    const maxQty = item?.current_inventory_qty || 0;
    // Keep as string for input, parse for validation
    const numQty = parseFloat(qty) || 0;
    const val = Math.min(Math.max(0, numQty), maxQty);
    setReturnList(returnList.map(item => {
      if (item.id === id) {
        // Store as number, display without leading zeros
        return { ...item, return_qty: val };
      }
      return item;
    }));
  };

  // Remove item from return list
  const removeFromReturnList = (id) => {
    setReturnList(returnList.filter(item => item.id !== id));
  };

  // Calculate return total
  const calculateReturnTotal = () => {
    return returnList.reduce((sum, item) => sum + (parseFloat(item.return_qty) || 0) * (parseFloat(item.unit_price) || 0), 0).toFixed(2);
  };

  // Check if return list has items with qty > 0
  const hasItemsToReturn = () => {
    return returnList.some(item => item.return_qty > 0);
  };

  // Save return - does NOT reduce inventory (pending state)
  const handleSaveReturn = async () => {
    const itemsToReturn = returnList.filter(item => item.return_qty > 0);

    if (itemsToReturn.length === 0) {
      return Swal.fire("Error", "Please enter return quantities for at least one item", "error");
    }

    const result = await Swal.fire({
      title: "Save Return?",
      text: `This will save ${itemsToReturn.length} item(s) as pending return.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Save Return",
      cancelButtonText: "Cancel"
    });

    if (!result.isConfirmed) return;

    try {
      // Generate return number
      const { data: existingReturns } = await supabase
        .from("purchase_returns")
        .select("return_number")
        .order("id", { ascending: false })
        .limit(1);

      let nextNum = 1;
      if (existingReturns && existingReturns.length > 0 && existingReturns[0].return_number) {
        const lastNum = parseInt(existingReturns[0].return_number.replace("RET-", ""), 10);
        if (!isNaN(lastNum)) {
          nextNum = lastNum + 1;
        }
      }
      const returnNumber = `RET-${nextNum}`;

      // Save return record with pending status (no inventory reduction yet)
      const returnData = {
        return_number: returnNumber,
        total_amount: calculateReturnTotal(),
        items_count: itemsToReturn.length,
        status: "pending",
        created_by: user?.id || null
      };

      const { data: newReturn, error: returnError } = await supabase
        .from("purchase_returns")
        .insert([returnData])
        .select()
        .single();

      if (returnError) throw returnError;

      // Save return items with their quantities
      const returnItemsData = itemsToReturn.map(item => ({
        return_id: newReturn.id,
        purchase_id: item.purchase_id,
        purchase_item_id: item.id, // Store the purchase_items row ID
        invoice_number: item.invoice_number,
        item_name: item.item_name,
        type: item.type,
        qty: item.return_qty,
        unit_price: item.unit_price,
        total_price: item.return_qty * item.unit_price
      }));

      await supabase.from("purchase_return_items").insert(returnItemsData);

      Swal.fire("Success", `Return saved! Return #${returnNumber}`, "success");

      // Clear return list and refresh data
      setReturnList([]);
      setShowReturnListModal(false);
      setSearchTerm("");
      setSearchResults([]);
      await fetchData();
    } catch (err) {
      console.error("Error:", err);
      Swal.fire("Error", err.message || "Failed to save return", "error");
    }
  };

  // View return items
  const viewReturnItems = async (returnItem) => {
    const { data: items } = await supabase
      .from("purchase_return_items")
      .select("*")
      .eq("return_id", returnItem.id)
      .order("id", { ascending: true });

    setSelectedReturn(returnItem);
    setSelectedReturnItems(items || []);
    setShowReturnItemsModal(true);
  };

  // Complete return - reduce inventory and mark as completed
  const handleCompleteReturn = async (ret) => {
    // Check if already processed
    if (ret.status === "completed") {
      return Swal.fire("Info", "This return has already been processed", "info");
    }

    const result = await Swal.fire({
      title: "Process Return?",
      text: "This will reduce inventory and mark purchases as returned.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Process Return",
      cancelButtonText: "Cancel"
    });

    if (!result.isConfirmed) return;

    try {
      // Get return items
      const { data: items } = await supabase
        .from("purchase_return_items")
        .select("*")
        .eq("return_id", ret.id);

      if (!items || items.length === 0) {
        return Swal.fire("Error", "No items found in this return", "error");
      }

      // Reduce inventory for each item
      for (const item of items) {
        const { data: existing } = await supabase
          .from("inventory")
          .select("*")
          .ilike("item_name", item.item_name.trim())
          .maybeSingle();

        if (existing) {
          const newQty = Math.max(0, existing.qty - item.qty);
          await supabase.from("inventory").update({ qty: newQty }).eq("id", existing.id);
        }

        // Update purchase_items qty - use purchase_item_id if available (direct lookup)
        if (item.purchase_item_id) {
          // Direct lookup by purchase_items row ID
          const { data: purchaseItem } = await supabase
            .from("purchase_items")
            .select("id, qty")
            .eq("id", item.purchase_item_id)
            .single();

          if (purchaseItem) {
            const newQty = Math.max(0, (purchaseItem.qty || 0) - item.qty);
            await supabase
              .from("purchase_items")
              .update({ qty: newQty })
              .eq("id", item.purchase_item_id);
            console.log(`Updated purchase_items id=${item.purchase_item_id}: ${purchaseItem.qty} -> ${newQty}`);
          }
        } else {
          // Fallback: find by purchase_id + item_name
          const { data: purchaseItems } = await supabase
            .from("purchase_items")
            .select("id, qty, purchase_id, item_name, type")
            .eq("purchase_id", item.purchase_id);

          if (purchaseItems && purchaseItems.length > 0) {
            const purchaseItem = purchaseItems.find(pi =>
              pi.item_name.toLowerCase().trim() === item.item_name.toLowerCase().trim()
            );

            if (purchaseItem) {
              const newQty = Math.max(0, (purchaseItem.qty || 0) - item.qty);
              await supabase
                .from("purchase_items")
                .update({ qty: newQty })
                .eq("id", purchaseItem.id);
              console.log(`Updated purchase_items id=${purchaseItem.id}: ${purchaseItem.qty} -> ${newQty}`);
            }
          }
        }
      }

      // Update purchase status to returned
      const purchaseIds = [...new Set(items.map(i => i.purchase_id))];
      for (const purchaseId of purchaseIds) {
        await supabase
          .from("purchases")
          .update({ status: "returned" })
          .eq("id", purchaseId);
      }

      // Update return status to completed
      await supabase
        .from("purchase_returns")
        .update({ status: "completed" })
        .eq("id", ret.id);

      Swal.fire("Success", "Return processed and inventory reduced!", "success");
      await fetchData();

      if (setInventory) {
        const { data } = await supabase.from("inventory").select("*").order("id", { ascending: true });
        setInventory(data || []);
      }
    } catch (err) {
      console.error("Error:", err);
      Swal.fire("Error", err.message || "Failed to process return", "error");
    }
  };

  // Add more items to existing return
  const handleAddToReturn = async (ret) => {
    setEditingReturnId(ret.id);
    openInvoiceSearchModal();
  };

  // Save return with existing return ID (for adding more items)
  const handleSaveReturnWithId = async (returnId) => {
    const itemsToReturn = returnList.filter(item => item.return_qty > 0);

    if (itemsToReturn.length === 0) {
      return Swal.fire("Error", "Please enter return quantities for at least one item", "error");
    }

    const result = await Swal.fire({
      title: "Add Items to Return?",
      text: `This will add ${itemsToReturn.length} item(s) to the existing return.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Add Items",
      cancelButtonText: "Cancel"
    });

    if (!result.isConfirmed) return;

    try {
      // Group items by purchase_id for status update check
      const purchaseIds = [...new Set(itemsToReturn.map(i => i.purchase_id))];

      // Reduce inventory for each returned item
      for (const item of itemsToReturn) {
        // Reduce inventory qty
        const { data: existing } = await supabase
          .from("inventory")
          .select("*")
          .ilike("item_name", item.item_name.trim())
          .maybeSingle();

        if (existing) {
          const newQty = Math.max(0, existing.qty - item.return_qty);
          await supabase.from("inventory").update({ qty: newQty }).eq("id", existing.id);
        }

        // Update purchase_items qty
        const { data: currentItem } = await supabase
          .from("purchase_items")
          .select("original_qty, qty")
          .eq("id", item.id)
          .single();

        const originalQty = currentItem?.original_qty || currentItem?.qty || item.qty;
        await supabase
          .from("purchase_items")
          .update({
            original_qty: originalQty,
            qty: Math.max(0, (currentItem?.qty || 0) - item.return_qty)
          })
          .eq("id", item.id);
      }

      // Check and update purchase status if all items fully returned
      for (const purchaseId of purchaseIds) {
        const { data: updatedItems } = await supabase
          .from("purchase_items")
          .select("*")
          .eq("purchase_id", purchaseId);

        const { data: inventory } = await supabase
          .from("inventory")
          .select("item_name, qty");

        let allReturned = true;
        for (const item of updatedItems) {
          const invItem = inventory?.find(i => i.item_name.toLowerCase() === item.item_name.toLowerCase());
          const currentQty = invItem ? invItem.qty : 0;
          if (currentQty > 0) {
            allReturned = false;
            break;
          }
        }

        if (allReturned) {
          await supabase.from("purchases").update({ status: "returned" }).eq("id", purchaseId);
        }
      }

      // Calculate new total
      const { data: existingReturn } = await supabase
        .from("purchase_returns")
        .select("total_amount")
        .eq("id", returnId)
        .single();

      const newTotal = (parseFloat(existingReturn?.total_amount) || 0) + parseFloat(calculateReturnTotal());
      const newItemsCount = (editingReturnItemsCount || 0) + itemsToReturn.length;

      // Update return record
      await supabase
        .from("purchase_returns")
        .update({
          total_amount: newTotal,
          items_count: newItemsCount
        })
        .eq("id", returnId);

      // Save return items
      const returnItemsData = itemsToReturn.map(item => ({
        return_id: returnId,
        purchase_id: item.purchase_id,
        invoice_number: item.invoice_number,
        item_name: item.item_name,
        type: item.type,
        qty: item.return_qty,
        unit_price: item.unit_price,
        total_price: item.return_qty * item.unit_price
      }));

      await supabase.from("purchase_return_items").insert(returnItemsData);

      Swal.fire("Success", "Items added to return!", "success");

      // Clear return list and refresh data
      setReturnList([]);
      setEditingReturnId(null);
      setShowReturnListModal(false);
      setSearchTerm("");
      setSearchResults([]);
      await fetchData();

      if (setInventory) {
        const { data } = await supabase.from("inventory").select("*").order("id", { ascending: true });
        setInventory(data || []);
      }
    } catch (err) {
      console.error("Error:", err);
      Swal.fire("Error", err.message || "Failed to add items to return", "error");
    }
  };

  const [editingReturnItemsCount, setEditingReturnItemsCount] = useState(0);

  // Cancel return - update status to cancelled
  const handleCancelReturn = async (ret) => {
    const result = await Swal.fire({
      title: "Cancel Return?",
      text: "This will mark the return as cancelled. This action cannot be undone.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Cancel Return",
      cancelButtonText: "No"
    });

    if (!result.isConfirmed) return;

    try {
      // Only restore inventory if return was completed
      if (ret.status === "completed") {
        // Get return items
        const { data: items } = await supabase
          .from("purchase_return_items")
          .select("*")
          .eq("return_id", ret.id);

        if (items && items.length > 0) {
          // Restore inventory for each item
          for (const item of items) {
            const { data: existing } = await supabase
              .from("inventory")
              .select("*")
              .ilike("item_name", item.item_name.trim())
              .maybeSingle();

            if (existing) {
              const newQty = existing.qty + item.qty;
              await supabase.from("inventory").update({ qty: newQty }).eq("id", existing.id);
            }

            // Restore purchase_items qty - use purchase_item_id if available
            if (item.purchase_item_id) {
              const { data: purchaseItem } = await supabase
                .from("purchase_items")
                .select("id, qty")
                .eq("id", item.purchase_item_id)
                .single();

              if (purchaseItem) {
                await supabase
                  .from("purchase_items")
                  .update({ qty: (purchaseItem.qty || 0) + item.qty })
                  .eq("id", item.purchase_item_id);
                console.log(`Restored purchase_items id=${item.purchase_item_id}: ${purchaseItem.qty} -> ${purchaseItem.qty + item.qty}`);
              }
            } else {
              // Fallback: find by purchase_id + item_name
              const { data: purchaseItem } = await supabase
                .from("purchase_items")
                .select("id, qty, purchase_id")
                .eq("purchase_id", item.purchase_id)
                .ilike("item_name", item.item_name.trim())
                .maybeSingle();

              if (purchaseItem) {
                await supabase
                  .from("purchase_items")
                  .update({ qty: (purchaseItem.qty || 0) + item.qty })
                  .eq("id", purchaseItem.id);
              }
            }
          }

          // Update purchase status - item.purchase_id is already the parent purchase ID
          const purchaseIds = [...new Set(items.map(i => i.purchase_id))];
          for (const purchaseId of purchaseIds) {
            await supabase
              .from("purchases")
              .update({ status: "received" })
              .eq("id", purchaseId);
          }
        }
      }

      // Update return status to cancelled (don't delete)
      await supabase
        .from("purchase_returns")
        .update({ status: "cancelled" })
        .eq("id", ret.id);

      Swal.fire("Cancelled", "Return has been cancelled", "success");
      await fetchData();

      if (setInventory && ret.status === "completed") {
        const { data } = await supabase.from("inventory").select("*").order("id", { ascending: true });
        setInventory(data || []);
      }
    } catch (err) {
      console.error("Error:", err);
      Swal.fire("Error", err.message || "Failed to cancel return", "error");
    }
  };

  const filteredReturns = savedReturns.filter((r) => {
    const matchesSearch = r.return_number?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const clearReturnList = () => {
    setReturnList([]);
  };

  const totalPages = Math.ceil(filteredReturns.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedReturns = filteredReturns.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Purchase Return</h1>
          <p className="text-sm text-slate-500 mt-1">Process returns for received purchases</p>
        </div>
        <button
          onClick={openInvoiceSearchModal}
          className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700"
        >
          New Return
        </button>
      </div>


      {/* Saved Returns Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
        <div className="px-4 py-3 bg-slate-100 border-b border-slate-200">
          <h3 className="font-semibold text-slate-700">Saved Returns</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Return #</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700">Status</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700">Items</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">Total Amount</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {savedReturns.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No saved returns found</td>
              </tr>
            ) : (
              paginatedReturns.map((ret) => {
                const isCompleted = ret.status === "completed";
                const isCancelled = ret.status === "cancelled";
                return (
                <tr key={ret.id} className={`border-t border-slate-100 ${
                  isCompleted ? "bg-emerald-50 hover:bg-emerald-100" :
                  isCancelled ? "bg-slate-50 hover:bg-slate-100" :
                  "bg-amber-50 hover:bg-amber-100"
                }`}>
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    <button
                      onClick={() => viewReturnItems(ret)}
                      className="text-indigo-600 hover:text-indigo-800 underline"
                    >
                      {ret.return_number}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {ret.created_at ? new Date(ret.created_at).toLocaleDateString() : "-"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      isCompleted
                        ? "bg-emerald-100 text-emerald-700"
                        : isCancelled
                        ? "bg-slate-100 text-slate-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {isCompleted ? "Completed" : isCancelled ? "Cancelled" : "Pending"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-600">{ret.items_count}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-600">{formatMMK(ret.total_amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center gap-2">
                      {!isCompleted && !isCancelled && (
                        <button
                          onClick={() => handleCompleteReturn(ret)}
                          className="px-2 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
                          title="Complete return - reduce inventory"
                        >
                          Complete
                        </button>
                      )}
                      <button
                        onClick={() => viewReturnItems(ret)}
                        className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                      >
                        View
                      </button>
                      {!isCompleted && !isCancelled && (
                        <button
                          onClick={() => handleCancelReturn(ret)}
                          className="px-2 py-1 text-xs bg-rose-600 text-white rounded hover:bg-rose-700"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center mt-6 gap-2">
          <button
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 disabled:opacity-50 hover:bg-slate-100"
          >
            Previous
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={`px-3 py-1.5 border rounded-lg text-sm font-medium ${
                currentPage === page
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "border-slate-300 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {page}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 disabled:opacity-50 hover:bg-slate-100"
          >
            Next
          </button>
        </div>
      )}

      {/* Invoice Search Modal */}
      {showInvoiceSearchModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 overflow-y-auto py-8">
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl shadow-xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Search Invoice</h3>
                <p className="text-sm text-slate-500">Find invoices to add items to return</p>
              </div>
              <button
                onClick={closeInvoiceSearchModal}
                className="text-slate-400 hover:text-slate-600 text-xl"
              >
                X
              </button>
            </div>

            {/* Search Input */}
            <div className="flex gap-3 mb-4">
              <input
                type="text"
                placeholder="Enter invoice number..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  handleSearch();
                }}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setSearchResults(allReceivedPurchases);
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Search Results */}
            <div className="border border-slate-200 rounded-lg overflow-hidden flex-1 overflow-y-auto">
              <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-200">
                <p className="text-sm text-emerald-700">
                  {searchResults.length} received invoice(s)
                  {searchTerm && ` matching "${searchTerm}"`}
                </p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Invoice #</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Supplier</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">Total</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        {allReceivedPurchases.length === 0
                          ? "No received purchases found. Please complete some purchases first."
                          : searchTerm
                            ? `No invoices found matching "${searchTerm}"`
                            : "No results"}
                      </td>
                    </tr>
                  ) : (
                    searchResults.map((purchase) => (
                      <tr key={purchase.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30">
                        <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{purchase.invoice_number}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{purchase.date}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{getSupplierName(purchase.supplier_id)}</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400 font-medium">{formatMMK(purchase.total_amount)}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => viewInvoiceItems(purchase)}
                            className="px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
                          >
                            Add to Return
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mt-4 pt-4 border-t border-slate-200">
              <button
                onClick={closeInvoiceSearchModal}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return List Modal */}
      {showReturnListModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 overflow-y-auto py-8">
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl shadow-xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Return List</h3>
                <p className="text-sm text-slate-500">Items from multiple invoices</p>
              </div>
              <button
                onClick={() => setShowReturnListModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xl"
              >
                X
              </button>
            </div>

            {returnList.length === 0 ? (
              <div className="text-center py-8 text-slate-500">No items in return list</div>
            ) : (
              <>
                <div className="border border-slate-200 rounded-lg overflow-hidden flex-1 overflow-y-auto mb-4">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">Invoice #</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">Item</th>
                        <th className="px-3 py-2 text-center font-semibold text-slate-700">Unit</th>
                        <th className="px-3 py-2 text-center font-semibold text-slate-700">In Stock</th>
                        <th className="px-3 py-2 text-center font-semibold text-slate-700">Return Qty</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-700">Unit Price</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-700">Total</th>
                        <th className="px-3 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {returnList.map((item) => (
                        <tr key={item.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-xs text-slate-500">{item.invoice_number}</td>
                          <td className="px-3 py-2 text-slate-800 font-medium">{item.item_name}</td>
                          <td className="px-3 py-2 text-center text-slate-600">{item.type || "-"}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              item.current_inventory_qty > 0
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-red-100 text-red-700"
                            }`}>
                              {item.current_inventory_qty}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={item.return_qty === 0 ? '' : item.return_qty}
                              onChange={(e) => updateReturnQty(item.id, e.target.value)}
                              min="0"
                              max={item.current_inventory_qty}
                              className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm text-center focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-right text-slate-600">{formatMMK(item.unit_price)}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-800">
                            {formatMMK((item.return_qty || 0) * item.unit_price)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => removeFromReturnList(item.id)}
                              className="text-rose-500 hover:text-rose-700 font-bold"
                            >
                              X
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50">
                      <tr>
                        <td colSpan={6} className="px-3 py-2 text-right font-bold text-slate-800">
                          Return Total
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-amber-600">
                          {formatMMK(calculateReturnTotal())}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                  <button
                    onClick={() => {
                      setShowReturnListModal(false);
                      setShowInvoiceSearchModal(true);
                    }}
                    className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Add More Items
                  </button>
                  <button
                    onClick={() => {
                      if (editingReturnId) {
                        handleSaveReturnWithId(editingReturnId);
                      } else {
                        handleSaveReturn();
                      }
                    }}
                    disabled={!hasItemsToReturn()}
                    className="px-5 py-2.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editingReturnId ? "Add to Return" : "Save Return"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Return Items Modal */}
      {showReturnItemsModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl mx-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Return Details</h3>
                <p className="text-sm text-slate-500">{selectedReturn?.return_number}</p>
              </div>
              <button
                onClick={() => {
                  setSelectedReturn(null);
                  setSelectedReturnItems([]);
                  setShowReturnItemsModal(false);
                }}
                className="text-slate-400 hover:text-slate-600 text-xl"
              >
                X
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Return #:</span>
                <span className="ml-2 font-semibold">{selectedReturn?.return_number}</span>
              </div>
              <div>
                <span className="text-slate-500">Date:</span>
                <span className="ml-2">
                  {selectedReturn?.created_at ? new Date(selectedReturn.created_at).toLocaleString() : "-"}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Items:</span>
                <span className="ml-2 font-medium">{selectedReturn?.items_count}</span>
              </div>
              <div>
                <span className="text-slate-500">Total Amount:</span>
                <span className="ml-2 font-bold text-amber-600">{formatMMK(selectedReturn?.total_amount)}</span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Invoice #</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Item</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Unit</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Qty</th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700">Unit Price</th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedReturnItems.length > 0 ? (
                    selectedReturnItems.map((item, idx) => (
                      <tr key={idx} className="border-t border-slate-100">
                        <td className="px-4 py-2 text-slate-600 text-xs">{item.invoice_number}</td>
                        <td className="px-4 py-2 text-slate-800 font-medium">{item.item_name}</td>
                        <td className="px-4 py-2 text-center text-slate-600">{item.type || "-"}</td>
                        <td className="px-4 py-2 text-center text-slate-600">{item.qty}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{formatMMK(item.unit_price)}</td>
                        <td className="px-4 py-2 text-right font-medium text-slate-800">{formatMMK(item.total_price)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-4 text-center text-slate-500">No items found</td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr>
                    <td colSpan={5} className="px-4 py-2 text-right font-bold text-slate-800">Grand Total</td>
                    <td className="px-4 py-2 text-right font-bold text-amber-600">{formatMMK(selectedReturn?.total_amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setSelectedReturn(null);
                  setSelectedReturnItems([]);
                  setShowReturnItemsModal(false);
                }}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShowReturnItemsModal(false);
                  handleCancelReturn(selectedReturn);
                }}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700"
              >
                Cancel Return
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
