import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function Category() {
  const [categories, setCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });

  // Fetch categories
  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("id", { ascending: true });
      if (error) throw error;
      setCategories(data || []);
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to load categories", "error");
      setCategories([]);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const openAddModal = () => {
    setFormData({ name: "", description: "" });
    setIsEditing(false);
    setEditItem(null);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setFormData({
      name: item.name || "",
      description: item.description || "",
    });
    setEditItem(item);
    setIsEditing(true);
    setShowModal(true);
  };

  const handleFormChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      return Swal.fire("Error", "Category name is required", "error");
    }

    try {
      if (isEditing && editItem) {
        const { error: updateErr } = await supabase
          .from("categories")
          .update({
            name: formData.name.trim(),
            description: formData.description.trim(),
          })
          .eq("id", editItem.id);
        if (updateErr) throw updateErr;
        Swal.fire("Success", "Category updated!", "success");
      } else {
        const { error: insertErr } = await supabase
          .from("categories")
          .insert([{ name: formData.name.trim(), description: formData.description.trim() }]);
        if (insertErr) throw insertErr;
        Swal.fire("Success", "Category created!", "success");
      }
      setShowModal(false);
      fetchCategories();
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to save category", "error");
    }
  };

  const handleDelete = async (id) => {
    const result = await Swal.fire({
      title: "Delete this category?",
      text: "Menu items in this category will be uncategorized.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
    });
    if (result.isConfirmed) {
      try {
        // Update menu items to remove category
        await supabase
          .from("menu")
          .update({ category_id: null })
          .eq("category_id", id);

        // Delete category
        const { error } = await supabase.from("categories").delete().eq("id", id);
        if (error) throw error;
        Swal.fire("Deleted!", "Category deleted.", "success");
        fetchCategories();
      } catch (err) {
        Swal.fire("Error", err.message || "Failed to delete", "error");
      }
    }
  };

  const filteredCategories = categories.filter((c) =>
    (c.name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <input
          type="text"
          placeholder="Search categories..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-4 py-2 border rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={openAddModal}
          className="px-5 py-2 bg-green-600 text-white rounded-2xl shadow hover:bg-green-700 transition"
        >
          + Add Category
        </button>
      </div>

      {filteredCategories.length === 0 ? (
        <p className="text-gray-500 text-center mt-10">No categories found</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCategories.map((item) => (
            <div
              key={item.id}
              className="bg-white shadow-lg rounded-2xl p-5 hover:shadow-2xl transition"
            >
              <h3 className="font-bold text-xl text-gray-800">{item.name}</h3>
              <p className="text-gray-500 text-sm mt-1">
                {item.description || "No description"}
              </p>
              <p className="text-gray-400 text-xs mt-2">
                ID: {item.id}
              </p>
              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => openEditModal(item)}
                  className="px-3 py-1 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="px-3 py-1 bg-red-500 text-white rounded-2xl hover:bg-red-600 transition"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-lg">
            <h3 className="text-2xl font-bold mb-4">
              {isEditing ? "Edit Category" : "Add Category"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category Name *
                </label>
                <input
                  name="name"
                  placeholder="Category Name"
                  value={formData.name}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  placeholder="Description (optional)"
                  value={formData.description}
                  onChange={handleFormChange}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-gray-300 rounded-2xl hover:bg-gray-400 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-2xl hover:bg-green-700 transition"
                >
                  {isEditing ? "Update" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
