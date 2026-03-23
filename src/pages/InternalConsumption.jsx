import { useState, useEffect, useMemo } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function InternalConsumption({ inventory, setInventory }) {
  const [records, setRecords] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [selectedAddItems, setSelectedAddItems] = useState([]);
  const [formData, setFormData] = useState({
    notes: "",
  });
  const [addFormData, setAddFormData] = useState({
    notes: "",
  });
  const [loading, setLoading] = useState(false);

  // Filter states
  const [dateFilter, setDateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Search states
  const [itemSearch, setItemSearch] = useState("");
  const [recordSearch, setRecordSearch] = useState("");

  const user = JSON.parse(localStorage.getItem("user"));
  const isSuperAdmin = user?.role === "superadmin";
  const currentUsername = user?.username || "Unknown";

  // Fetch consumption records
  const fetchRecords = async () => {
    try {
      const { data, error } = await supabase
        .from("internal_consumption")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRecords(data || []);
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  // Filter records by date
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

      // Status filter
      if (statusFilter !== "all") {
        if (statusFilter === "add_stock" && record.status !== "add_stock") return false;
        if (statusFilter === "usage" && record.status !== "completed") return false;
      }

      // Record search filter
      if (recordSearch) {
        const searchLower = recordSearch.toLowerCase();
        const matchesId = record.id.toString().includes(searchLower);
        const matchesUser = record.user_name?.toLowerCase().includes(searchLower);
        const matchesNotes = record.notes?.toLowerCase().includes(searchLower);
        if (!matchesId && !matchesUser && !matchesNotes) return false;
      }

      return true;
    });
  }, [records, dateFilter, customStart, customEnd, recordSearch, statusFilter]);

  // Paginated records
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredRecords.slice(start, start + itemsPerPage);
  }, [filteredRecords, currentPage]);

  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);

  const toggleItemSelection = (item) => {
    setSelectedItems((prev) => {
      const exists = prev.find((i) => i.id === item.id);
      if (exists) {
        return prev.filter((i) => i.id !== item.id);
      }
      return [...prev, { ...item, usage_qty: "" }];
    });
  };

  const updateItemUsageQty = (itemId, qty) => {
    setSelectedItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, usage_qty: qty } : i,
      ),
    );
  };

  // Add Stock Functions
  const toggleAddItemSelection = (item) => {
    setSelectedAddItems((prev) => {
      const exists = prev.find((i) => i.id === item.id);
      if (exists) {
        return prev.filter((i) => i.id !== item.id);
      }
      return [...prev, { ...item, add_qty: "" }];
    });
  };

  const updateItemAddQty = (itemId, qty) => {
    setSelectedAddItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, add_qty: qty } : i,
      ),
    );
  };

  const handleAddStockSubmit = async (e) => {
    e.preventDefault();
    if (selectedAddItems.length === 0) {
      return Swal.fire("Error", "Please select at least one item", "error");
    }

    // Validate quantities
    for (const item of selectedAddItems) {
      const qty = item.add_qty === "" ? 0 : item.add_qty;
      if (!qty || qty <= 0) {
        return Swal.fire(
          "Error",
          `Please enter valid quantity for ${item.item_name}`,
          "error",
        );
      }
    }

    setLoading(true);
    try {
      const userName = currentUsername;

      // Create add stock record
      const { data: record, error: recordErr } = await supabase
        .from("internal_consumption")
        .insert([
          {
            notes: addFormData.notes,
            status: "add_stock",
            user_name: userName,
          },
        ])
        .select()
        .single();
      if (recordErr) throw recordErr;

      // Create records and add inventory
      for (const item of selectedAddItems) {
        const addQty = parseFloat(item.add_qty);
        const currentInv = inventory.find(inv => inv.id === item.id);
        const currentQty = currentInv ? currentInv.qty : 0;

        try {
          // Insert consumption item
          const result = await supabase
            .from("internal_consumption_items")
            .insert({
              consumption_id: record.id,
              inventory_id: item.id,
              qty: addQty,
            });

          if (result.error) {
            console.error("Insert error:", result.error);
            alert(`Error saving item: ${result.error.message}`);
          }
        } catch (err) {
          console.error("Insert exception:", err);
        }

        // Add inventory
        const newQty = currentQty + addQty;
        await supabase
          .from("inventory")
          .update({ qty: newQty })
          .eq("id", item.id);
      }

      // Refresh data
      await fetchRecords();

      // Update local inventory state
      const updatedInventory = inventory.map((inv) => {
        const added = selectedAddItems.find((s) => s.id === inv.id);
        if (added) {
          return { ...inv, qty: inv.qty + parseFloat(added.add_qty) };
        }
        return inv;
      });
      setInventory(updatedInventory);

      Swal.fire("Success", "Stock added successfully!", "success");
      setShowAddModal(false);
      setSelectedAddItems([]);
      setAddFormData({ notes: "" });
      fetchRecords();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedItems.length === 0) {
      return Swal.fire("Error", "Please select at least one item", "error");
    }

    // Validate quantities
    for (const item of selectedItems) {
      const qty = item.usage_qty === "" ? 0 : item.usage_qty;
      if (!qty || qty <= 0) {
        return Swal.fire(
          "Error",
          `Please enter valid quantity for ${item.item_name}`,
          "error",
        );
      }
      if (qty > item.qty) {
        return Swal.fire(
          "Error",
          `Usage quantity cannot exceed available stock for ${item.item_name}`,
          "error",
        );
      }
    }

    setLoading(true);
    try {
      // Get user info from user table
      const userName = currentUsername;

      // Create consumption record with user info
      const { data: record, error: recordErr } = await supabase
        .from("internal_consumption")
        .insert([
          {
            notes: formData.notes,
            status: "completed",
            user_name: userName,
          },
        ])
        .select()
        .single();
      if (recordErr) throw recordErr;

      // Create consumption items and deduct inventory
      for (const item of selectedItems) {
        const usageQty = parseFloat(item.usage_qty);
        const currentInv = inventory.find(inv => inv.id === item.id);
        const currentQty = currentInv ? currentInv.qty : 0;

        await supabase.from("internal_consumption_items").insert({
          consumption_id: record.id,
          inventory_id: item.id,
          qty: usageQty,
        });

        // Deduct inventory from current inventory
        const newQty = currentQty - usageQty;
        await supabase
          .from("inventory")
          .update({ qty: newQty })
          .eq("id", item.id);
      }

      // Update local inventory state
      const updatedInventory = inventory.map((inv) => {
        const used = selectedItems.find((s) => s.id === inv.id);
        if (used) {
          return { ...inv, qty: inv.qty - parseFloat(used.usage_qty) };
        }
        return inv;
      });
      setInventory(updatedInventory);

      Swal.fire("Success", "Usage recorded successfully!", "success");
      setShowModal(false);
      setSelectedItems([]);
      setFormData({ notes: "" });
      fetchRecords();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const deleteRecord = async (id) => {
    const result = await Swal.fire({
      title: "Delete this record?",
      text: "This will restore the inventory quantities",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
    });

    if (result.isConfirmed) {
      try {
        // Get items to restore inventory
        const { data: items } = await supabase
          .from("internal_consumption_items")
          .select("*")
          .eq("consumption_id", id);

        // Restore inventory
        for (const item of items || []) {
          const inv = inventory.find((i) => i.id === item.inventory_id);
          if (inv) {
            await supabase
              .from("inventory")
              .update({ qty: inv.qty + item.qty })
              .eq("id", item.inventory_id);
          }
        }

        // Delete items first
        await supabase
          .from("internal_consumption_items")
          .delete()
          .eq("consumption_id", id);

        // Delete record
        await supabase.from("internal_consumption").delete().eq("id", id);

        Swal.fire(
          "Deleted!",
          "Record deleted and inventory restored",
          "success",
        );
        fetchRecords();
      } catch (err) {
        Swal.fire("Error", err.message, "error");
      }
    }
  };

  // Fetch items for each record
  const fetchRecordItems = async (recordId) => {
    const { data } = await supabase
      .from("internal_consumption_items")
      .select("*")
      .eq("consumption_id", recordId);
    return data || [];
  };

  const [expandedRecord, setExpandedRecord] = useState(null);
  const [recordItems, setRecordItems] = useState({});

  const toggleRecordDetails = async (record) => {
    if (expandedRecord === record.id) {
      setExpandedRecord(null);
    } else {
      setExpandedRecord(record.id);
      // Always fetch fresh data when expanding
      const items = await fetchRecordItems(record.id);
      setRecordItems((prev) => ({ ...prev, [record.id]: items }));
    }
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Internal Consumption</h1>
          <p className="text-sm text-slate-500 mt-1">Manage stock and usage</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            + Add Stock
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            + Record Usage
          </button>
        </div>
      </div>

      {/* Date Filter */}
      <div className="bg-white rounded-2xl shadow p-4 mb-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Search records..."
              value={recordSearch}
              onChange={(e) => {
                setRecordSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 border rounded-xl"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Date</label>
            <select
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 border rounded-xl"
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
                  onChange={(e) => {
                    setCustomStart(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 border rounded-xl"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => {
                    setCustomEnd(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 border rounded-xl"
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 border rounded-xl"
            >
              <option value="all">All Status</option>
              <option value="add_stock">Add Stock</option>
              <option value="usage">Usage</option>
            </select>
          </div>
          <div className="ml-auto text-sm text-gray-600">
            Showing {filteredRecords.length} record(s)
          </div>
        </div>
      </div>

      {/* Records List */}
      {filteredRecords.length === 0 ? (
        <p className="text-gray-500 text-center mt-10">
          No consumption records found
        </p>
      ) : (
        <>
          <div className="space-y-4">
            {paginatedRecords.map((record) => (
              <div key={record.id} className="bg-white rounded-2xl shadow p-4">
                <div
                  className="flex justify-between items-center cursor-pointer"
                  onClick={() => toggleRecordDetails(record)}
                >
                  <div>
                    <p className="font-semibold">Record #{record.id}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(record.created_at).toLocaleString()}
                    </p>
                    {record.user_name && (
                      <p className="text-sm text-blue-600">
                        Used by: {record.user_name}
                      </p>
                    )}
                    {record.notes && (
                      <p className="text-sm text-gray-600 mt-1">
                        Notes: {record.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium px-2 py-1 rounded ${
                      record.status === "add_stock"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {record.status === "add_stock" ? "Add Stock" : "Usage"}
                    </span>
                    <span className="text-2xl">
                      {expandedRecord === record.id ? "−" : "+"}
                    </span>
                  </div>
                </div>

                {expandedRecord === record.id && (
                  <div className="mt-4 border-t pt-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left">
                          <th className="pb-2">Item</th>
                          <th className="pb-2">{record.status === "add_stock" ? "Before" : "Before"}</th>
                          <th className="pb-2">{record.status === "add_stock" ? "Added" : "Used"}</th>
                          <th className="pb-2">Closing Qty</th>
                          <th className="pb-2">Unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(recordItems[record.id] || []).length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-4 text-center text-gray-500">
                              No items found for this record
                            </td>
                          </tr>
                        ) : (
                          (recordItems[record.id] || []).map((item, idx) => {
                            const inv = inventory.find(
                              (i) => i.id === item.inventory_id,
                            );
                            const isAddStock = record.status === "add_stock";
                            const isAdd = item.type === "add" || isAddStock;
                            const beforeQty = isAdd ? (inv?.qty || 0) - item.qty : (inv?.qty || 0) + item.qty;
                            const afterQty = inv ? inv.qty : 0;
                            return (
                              <tr key={idx} className="border-t">
                                <td className="py-2">
                                  {inv?.item_name || `Item ID: ${item.inventory_id}`}
                                </td>
                                <td className="py-2">{beforeQty}</td>
                                <td className={`py-2 ${isAdd ? "text-green-600" : "text-red-600"}`}>
                                  {isAdd ? "+" : "-"}{item.qty}
                                </td>
                                <td className="py-2">{afterQty}</td>
                                <td className="py-2">{inv?.type || "-"}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                    {isSuperAdmin && (
                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={() => deleteRecord(record.id)}
                          className="px-3 py-1 bg-red-500 text-white rounded-xl hover:bg-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-6">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-200 rounded-lg disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-sm">
                Page {currentPage} of {totalPages}
              </span>
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

      {/* Record Usage Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-lg">
            <h3 className="text-2xl font-bold mb-4">Record Internal Usage</h3>

            {!isSuperAdmin && (
              <p className="text-sm text-gray-600 mb-4 bg-yellow-50 p-2 rounded">
                Note: You can view inventory and record usage. Only superadmin
                can edit inventory directly.
              </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Inventory Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Items *
                </label>
                <input
                  type="text"
                  placeholder="Search items..."
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl mb-2"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto border rounded-xl p-2">
                  {inventory
                    .filter(item =>
                      item.item_name.toLowerCase().includes(itemSearch.toLowerCase())
                    )
                    .map((item) => {
                    const isSelected = selectedItems.some(
                      (s) => s.id === item.id,
                    );
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleItemSelection(item)}
                        className={`p-3 rounded-xl border cursor-pointer transition ${
                          isSelected
                            ? "bg-blue-50 border-blue-500"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{item.item_name}</p>
                            <p className="text-sm text-gray-500">
                              Available: {item.qty} {item.unit}
                            </p>
                          </div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-5 h-5"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Usage Quantities */}
              {selectedItems.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Usage Quantity *
                  </label>
                  <div className="space-y-2">
                    {selectedItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-2">
                        <span className="flex-1 text-sm">{item.item_name}</span>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          max={item.qty}
                          value={item.usage_qty}
                          onChange={(e) =>
                            updateItemUsageQty(
                              item.id,
                              e.target.value === "" ? "" : parseFloat(e.target.value) || 0
                            )
                          }
                          className="w-24 px-2 py-1 border rounded-xl"
                          placeholder="Enter qty"
                        />

                        <span className="text-sm text-gray-500 w-12">
                          {item.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  rows={2}
                  className="w-full px-3 py-2 border rounded-xl"
                  placeholder="Optional notes..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setSelectedItems([]);
                    setFormData({ notes: "" });
                    setItemSearch("");
                  }}
                  className="px-4 py-2 bg-gray-300 rounded-xl hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || selectedItems.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Stock Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-lg">
            <h3 className="text-2xl font-bold mb-4">Add Stock</h3>

            {!isSuperAdmin && (
              <p className="text-sm text-gray-600 mb-4 bg-yellow-50 p-2 rounded">
                Note: You can view inventory and add stock. Only superadmin can edit inventory directly.
              </p>
            )}

            <form onSubmit={handleAddStockSubmit} className="space-y-4">
              {/* Inventory Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Items *
                </label>
                <input
                  type="text"
                  placeholder="Search items..."
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl mb-2"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto border rounded-xl p-2">
                  {inventory
                    .filter(item =>
                      item.item_name.toLowerCase().includes(itemSearch.toLowerCase())
                    )
                    .map((item) => {
                    const isSelected = selectedAddItems.some(
                      (s) => s.id === item.id,
                    );
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleAddItemSelection(item)}
                        className={`p-3 rounded-xl border cursor-pointer transition ${
                          isSelected
                            ? "bg-green-50 border-green-500"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{item.item_name}</p>
                            <p className="text-sm text-gray-500">
                              Current Stock: {item.qty} {item.type}
                            </p>
                          </div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-5 h-5"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add Quantities */}
              {selectedAddItems.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Add Quantity *
                  </label>
                  <div className="space-y-2">
                    {selectedAddItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-2">
                        <span className="flex-1 text-sm">{item.item_name}</span>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={item.add_qty}
                          onChange={(e) =>
                            updateItemAddQty(
                              item.id,
                              e.target.value === "" ? "" : parseFloat(e.target.value) || 0
                            )
                          }
                          className="w-24 px-2 py-1 border rounded-xl"
                          placeholder="Enter qty"
                        />

                        <span className="text-sm text-gray-500 w-12">
                          {item.type}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={addFormData.notes}
                  onChange={(e) =>
                    setAddFormData({ ...addFormData, notes: e.target.value })
                  }
                  rows={2}
                  className="w-full px-3 py-2 border rounded-xl"
                  placeholder="Optional notes..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedAddItems([]);
                    setAddFormData({ notes: "" });
                    setItemSearch("");
                  }}
                  className="px-4 py-2 bg-gray-300 rounded-xl hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || selectedAddItems.length === 0}
                  className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
