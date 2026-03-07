import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function Inventory({
  inventory,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editCategoryId, setEditCategoryId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Get user role
  const user = JSON.parse(localStorage.getItem("user"));
  const isSuperAdmin = user?.role === "superadmin";

  const [formData, setFormData] = useState({
    item_name: "",
    qty: "",
    type: "",
    category_id: ""
  });

  const [categoryFormData, setCategoryFormData] = useState({
    name: "",
    description: ""
  });

  // Get category name by ID
  const getCategoryName = (categoryId) => {
    if (!categoryId) return "-";
    const cat = categories.find(c => c.id === categoryId);
    return cat ? cat.name : "-";
  };

  // Fetch inventory categories
  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("inventory_categories")
        .select("*")
        .order("id", { ascending: true });
      if (error) throw error;
      setCategories(data || []);
    } catch (err) {
      console.error("Error fetching categories:", err);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  // Filter inventory by search and category
  const filteredInventory = inventory.filter(item => {
    const matchesSearch = item.item_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || item.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const totalPages = Math.ceil(filteredInventory.length / itemsPerPage);

  const paginatedInventory = filteredInventory.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const openAddModal = () => {
    setFormData({ item_name: "", qty: "", type: "", category_id: "" });
    setIsEditing(false);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setFormData({
      item_name: item.item_name,
      qty: item.qty,
      type: item.type,
      category_id: item.category_id || ""
    });
    setEditId(item.id);
    setIsEditing(true);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      item_name: formData.item_name,
      qty: Number(formData.qty),
      type: formData.type,
      category_id: formData.category_id || null
    };

    isEditing
      ? await updateInventoryItem(editId, payload)
      : await addInventoryItem(payload);

    setShowModal(false);
    setIsEditing(false);
    setEditId(null);
  };

  // Category CRUD
  const openAddCategoryModal = () => {
    setCategoryFormData({ name: "", description: "" });
    setIsEditingCategory(false);
    setEditCategoryId(null);
    setShowCategoryModal(true);
  };

  const openEditCategoryModal = (cat) => {
    setCategoryFormData({ name: cat.name || "", description: cat.description || "" });
    setEditCategoryId(cat.id);
    setIsEditingCategory(true);
    setShowCategoryModal(true);
  };

  const handleCategorySubmit = async (e) => {
    e.preventDefault();
    if (!categoryFormData.name.trim()) {
      return Swal.fire("Error", "Category name is required", "error");
    }

    try {
      if (isEditingCategory && editCategoryId) {
        const { error } = await supabase
          .from("inventory_categories")
          .update({
            name: categoryFormData.name.trim(),
            description: categoryFormData.description.trim()
          })
          .eq("id", editCategoryId);
        if (error) throw error;
        Swal.fire("Success", "Category updated!", "success");
      } else {
        const { error } = await supabase
          .from("inventory_categories")
          .insert([{
            name: categoryFormData.name.trim(),
            description: categoryFormData.description.trim()
          }]);
        if (error) throw error;
        Swal.fire("Success", "Category created!", "success");
      }
      setShowCategoryModal(false);
      fetchCategories();
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to save category", "error");
    }
  };

  const handleDeleteCategory = async (id) => {
    const result = await Swal.fire({
      title: "Delete this category?",
      text: "Inventory items in this category will have no category.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel"
    });
    if (result.isConfirmed) {
      try {
        // Update inventory items to remove category
        await supabase
          .from("inventory")
          .update({ category_id: null })
          .eq("category_id", id);

        // Delete category
        const { error } = await supabase.from("inventory_categories").delete().eq("id", id);
        if (error) throw error;
        Swal.fire("Deleted!", "Category deleted.", "success");
        fetchCategories();
        if (selectedCategory === id) setSelectedCategory("all");
      } catch (err) {
        Swal.fire("Error", err.message || "Failed to delete", "error");
      }
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  return (
    <div className="flex flex-col h-screen p-4 md:p-6 gap-4">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h2 className="text-2xl md:text-3xl font-semibold text-gray-800">
          📦 Inventory
        </h2>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <input
            type="search"
            placeholder="Search items..."
            className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-400 outline-none"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />

          {isSuperAdmin && (
            <button
              onClick={openAddCategoryModal}
              className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg hover:opacity-90 transition"
            >
              + Category
            </button>
          )}

          <button
            onClick={openAddModal}
            className="px-5 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:opacity-90 transition"
            disabled={!isSuperAdmin}
          >
            + Add Item
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setSelectedCategory("all"); setCurrentPage(1); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            selectedCategory === "all"
              ? "bg-blue-500 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => { setSelectedCategory(cat.id); setCurrentPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
              selectedCategory === cat.id
                ? "bg-blue-500 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {cat.name}
            {isSuperAdmin && (
              <span
                onClick={(e) => { e.stopPropagation(); openEditCategoryModal(cat); }}
                className="text-xs opacity-70 hover:opacity-100"
              >
                ✏️
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table card */}
      <div className="flex flex-col flex-1 bg-white rounded-xl shadow-lg p-4 md:p-6">

        {/* Table wrapper */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse">
            <thead className="bg-gray-100 text-gray-700 sticky top-0 z-10">
              <tr>
                <th className="p-3 text-left">No</th>
                <th className="p-3 text-left">Item</th>
                <th className="p-3 text-center">Qty</th>
                <th className="p-3 text-left">Unit</th>
                <th className="p-3 text-left">Category</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>

            <tbody>
              {paginatedInventory.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-6 text-center text-gray-400">
                    No inventory found
                  </td>
                </tr>
              ) : (
                paginatedInventory.map((item, index) => (
                  <tr key={item.id} className="border-b hover:bg-gray-50 transition">
                    <td className="p-3">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                    <td className="p-3 font-medium">{item.item_name}</td>
                    <td className="p-3 text-center">{item.qty}</td>
                    <td className="p-3">{item.type}</td>
                    <td className="p-3">
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">
                        {getCategoryName(item.category_id)}
                      </span>
                    </td>
                    <td className="p-3 flex justify-center gap-2 flex-wrap">
                      {isSuperAdmin && (
                        <>
                          <button
                            onClick={() => openEditModal(item)}
                            className="px-3 py-1 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteInventoryItem(item.id)}
                            className="px-3 py-1 text-sm bg-red-500 text-white rounded-md hover:bg-red-600"
                          >
                            Delete
                          </button>
                        </>
                      )}
                      {!isSuperAdmin && <span className="text-gray-400 text-sm">View Only</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-4 mt-4">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              className={`px-4 py-2 rounded-lg ${
                currentPage === 1
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : "bg-blue-500 text-white hover:bg-blue-600"
              }`}
            >
              Prev
            </button>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              className={`px-4 py-2 rounded-lg ${
                currentPage === totalPages
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : "bg-blue-500 text-white hover:bg-blue-600"
              }`}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-xl font-semibold mb-4">
              {isEditing ? "Edit Item" : "Add Item"}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                name="item_name"
                placeholder="Item name"
                value={formData.item_name}
                onChange={handleChange}
                className="w-full px-4 py-2 border rounded-lg"
                required
              />
              <input
                type="number"
                name="qty"
                placeholder="Quantity"
                value={formData.qty}
                onChange={handleChange}
                className="w-full px-4 py-2 border rounded-lg"
                required
              />
              <input
                name="type"
                placeholder="Unit"
                value={formData.type}
                onChange={handleChange}
                className="w-full px-4 py-2 border rounded-lg"
                required
              />

              <select
                name="category_id"
                value={formData.category_id}
                onChange={handleChange}
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="">Select Category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
                >
                  {isEditing ? "Update" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-xl font-semibold mb-4">
              {isEditingCategory ? "Edit Category" : "Add Category"}
            </h3>

            <form onSubmit={handleCategorySubmit} className="space-y-4">
              <input
                name="name"
                placeholder="Category name"
                value={categoryFormData.name}
                onChange={(e) => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
                required
              />
              <textarea
                name="description"
                placeholder="Description (optional)"
                value={categoryFormData.description}
                onChange={(e) => setCategoryFormData({ ...categoryFormData, description: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg resize-none"
                rows="3"
              />

              <div className="flex justify-between pt-2">
                {isEditingCategory && (
                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(editCategoryId)}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
                  >
                    Delete
                  </button>
                )}
                <div className="flex gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowCategoryModal(false)}
                    className="px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition"
                  >
                    {isEditingCategory ? "Update" : "Save"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
