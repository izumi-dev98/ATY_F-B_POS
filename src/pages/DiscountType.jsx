import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function DiscountType() {
  const [discountTypes, setDiscountTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(null);
  const [formData, setFormData] = useState({ name: "", discount_percent: 0, description: "" });

  const fetchDiscountTypes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("discount_types")
        .select("*")
        .order("id", { ascending: true });
      if (error) throw error;
      setDiscountTypes(data || []);
    } catch (err) {
      console.error("Error fetching discount types:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDiscountTypes();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isEditing) {
        const { error } = await supabase
          .from("discount_types")
          .update({
            name: formData.name,
            discount_percent: Number(formData.discount_percent),
            description: formData.description,
          })
          .eq("id", isEditing);
        if (error) throw error;
        Swal.fire("Success", "Discount type updated!", "success");
      } else {
        const { error } = await supabase
          .from("discount_types")
          .insert([{
            name: formData.name,
            discount_percent: Number(formData.discount_percent),
            description: formData.description,
          }]);
        if (error) throw error;
        Swal.fire("Success", "Discount type added!", "success");
      }
      setFormData({ name: "", discount_percent: 0, description: "" });
      setIsEditing(null);
      fetchDiscountTypes();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  };

  const handleEdit = (item) => {
    setFormData({
      name: item.name,
      discount_percent: item.discount_percent,
      description: item.description || "",
    });
    setIsEditing(item.id);
  };

  const handleDelete = async (id) => {
    const result = await Swal.fire({
      title: "Delete this discount type?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });
    if (result.isConfirmed) {
      try {
        const { error } = await supabase.from("discount_types").delete().eq("id", id);
        if (error) throw error;
        Swal.fire("Deleted!", "Discount type deleted.", "success");
        fetchDiscountTypes();
      } catch (err) {
        Swal.fire("Error", err.message, "error");
      }
    }
  };

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Discount Type Management</h1>

      {/* Form */}
      <div className="bg-white p-6 rounded-xl shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">{isEditing ? "Edit Discount Type" : "Add Discount Type"}</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border px-3 py-2 rounded-lg"
              placeholder="e.g., Staff Discount"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Discount (%)</label>
            <input
              type="number"
              value={formData.discount_percent}
              onChange={(e) => setFormData({ ...formData, discount_percent: e.target.value })}
              className="w-full border px-3 py-2 rounded-lg"
              min="0"
              max="100"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full border px-3 py-2 rounded-lg"
              placeholder="Optional description"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              {isEditing ? "Update" : "Add"}
            </button>
            {isEditing && (
              <button
                type="button"
                onClick={() => {
                  setIsEditing(null);
                  setFormData({ name: "", discount_percent: 0, description: "" });
                }}
                className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="bg-white shadow-xl rounded-xl overflow-hidden">
        <table className="min-w-full text-left">
          <thead className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Discount (%)</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="5" className="text-center py-6">Loading...</td>
              </tr>
            ) : discountTypes.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center py-6">No Data Found</td>
              </tr>
            ) : (
              discountTypes.map((item) => (
                <tr key={item.id} className="border-b hover:bg-blue-50 transition">
                  <td className="px-4 py-3">{item.id}</td>
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3">{item.discount_percent}%</td>
                  <td className="px-4 py-3 text-gray-600">{item.description || "-"}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleEdit(item)}
                      className="text-blue-600 hover:underline mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
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
