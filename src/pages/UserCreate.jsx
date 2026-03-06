import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(5);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // null = add, object = edit
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");

  // ------------------- FETCH USERS -------------------
  const fetchUsers = async () => {
    const { data, error } = await supabase.from("user").select("*").order("id", { ascending: true });
    if (error) Swal.fire("Error", error.message, "error");
    else setUsers(data);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // ------------------- OPEN MODAL -------------------
  const openAddModal = () => {
    setEditingUser(null);
    setFullName("");
    setUsername("");
    setPassword("");
    setRole("user");
    setModalOpen(true);
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setFullName(user.full_name);
    setUsername(user.username);
    setPassword(""); // leave blank, only fill if changing
    setRole(user.role);
    setModalOpen(true);
  };

  // ------------------- SAVE USER -------------------
  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!fullName || !username || (!editingUser && !password)) {
      return Swal.fire("Error", "All fields are required", "error");
    }

    try {
      if (editingUser) {
        // UPDATE
        const updatedData = { full_name: fullName, username, role };
        if (password) updatedData.password = password;

        const { data, error } = await supabase
          .from("user")
          .update(updatedData)
          .eq("id", editingUser.id)
          .select()
          .single();

        if (error) return Swal.fire("Error", error.message, "error");

        setUsers((prev) => prev.map((u) => (u.id === data.id ? data : u)));
        Swal.fire("Success", "User updated", "success");
      } else {
        // CREATE
        const { data, error } = await supabase
          .from("user")
          .insert([{ full_name: fullName, username, password, role }])
          .select()
          .single();

        if (error) return Swal.fire("Error", error.message, "error");

        setUsers((prev) => [...prev, data]);
        Swal.fire("Success", `User ${data.username} created`, "success");
      }

      setModalOpen(false);
    } catch (err) {
      Swal.fire("Error", "Something went wrong", "error");
    }
  };

  // ------------------- DELETE USER -------------------
  const deleteUser = async (id) => {
    const result = await Swal.fire({
      title: "Delete User?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes",
    });
    if (result.isConfirmed) {
      const { error } = await supabase.from("user").delete().eq("id", id);
      if (error) Swal.fire("Error", error.message, "error");
      else {
        setUsers((prev) => prev.filter((u) => u.id !== id));
        Swal.fire("Deleted", "User removed", "success");
      }
    }
  };

  // ------------------- SEARCH & PAGINATION -------------------
  const filteredUsers = users.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const goToPage = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  // ------------------- RENDER -------------------
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">User Management</h2>
        <button
          onClick={openAddModal}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Add User
        </button>
      </div>

      {/* SEARCH */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by username or name..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
          className="w-full px-4 py-2 border rounded"
        />
      </div>

      {/* USER TABLE */}
      <table className="w-full table-auto border-collapse">
        <thead>
          <tr className="bg-gray-200">
            <th className="border px-4 py-2">#</th>
            <th className="border px-4 py-2">Full Name</th>
            <th className="border px-4 py-2">Username</th>
            <th className="border px-4 py-2">Role</th>
            <th className="border px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {paginatedUsers.map((user, idx) => (
            <tr key={user.id} className="text-center">
              <td className="border px-4 py-2">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
              <td className="border px-4 py-2">{user.full_name}</td>
              <td className="border px-4 py-2">{user.username}</td>
              <td className="border px-4 py-2">{user.role}</td>
              <td className="border px-4 py-2 space-x-2">
                <button
                  onClick={() => openEditModal(user)}
                  className="bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteUser(user.id)}
                  className="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {paginatedUsers.length === 0 && (
            <tr>
              <td colSpan="5" className="text-center py-4">No users found</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* PAGINATION */}
      <div className="mt-4 flex justify-center items-center space-x-2">
        <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400">Prev</button>
        {[...Array(totalPages)].map((_, i) => (
          <button
            key={i}
            onClick={() => goToPage(i + 1)}
            className={`px-3 py-1 rounded ${currentPage === i + 1 ? "bg-blue-500 text-white" : "bg-gray-200 hover:bg-gray-300"}`}
          >
            {i + 1}
          </button>
        ))}
        <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400">Next</button>
      </div>

      {/* ------------------- MODAL ------------------- */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white rounded p-6 w-96 relative">
            <h3 className="text-lg font-bold mb-4">{editingUser ? "Edit User" : "Add User"}</h3>
            <form onSubmit={handleSaveUser} className="space-y-3">
              <input
                type="text"
                placeholder="Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              />
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              />
              <input
                type="password"
                placeholder={editingUser ? "Leave blank to keep password" : "Password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="superadmin">Superadmin</option>
                <option value="admin">Admin</option>
                <option value="chef">Chef</option>
                <option value="user">User</option>
              </select>
              <div className="flex justify-end space-x-2 mt-3">
                <button type="button" onClick={() => setModalOpen(false)} className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400">
                  Cancel
                </button>
                <button type="submit" className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600">
                  {editingUser ? "Update" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
