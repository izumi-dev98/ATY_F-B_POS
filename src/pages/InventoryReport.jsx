import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import supabase from "../createClients";

export default function InventoryReport() {
  const [inventory, setInventory] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 5;

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .order("item_name", { ascending: true });

    if (!error) setInventory(data);
    setLoading(false);
  };

  // Search filter
  const filteredData = inventory.filter((item) =>
    item.item_name?.toLowerCase().includes(search.toLowerCase())
  );

  // Pagination logic
  const indexOfLast = currentPage * rowsPerPage;
  const indexOfFirst = indexOfLast - rowsPerPage;
  const currentData = filteredData.slice(indexOfFirst, indexOfLast);
  const totalPages = Math.ceil(filteredData.length / rowsPerPage);

  // Export Excel
  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(filteredData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory Report");

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });

    const fileData = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    saveAs(fileData, "Inventory_Report.xlsx");
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventory Report</h1>
          <p className="text-sm text-slate-500 mt-1">View inventory report</p>
        </div>

        <button
          onClick={exportToExcel}
          className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
        >
          Export Excel
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <input
          type="text"
          placeholder="Search item..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
          className="w-full md:w-1/3 border border-gray-300 px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Item Name</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Quantity</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Unit</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Price</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="4" className="text-center py-6">
                  Loading...
                </td>
              </tr>
            ) : currentData.length === 0 ? (
              <tr>
                <td colSpan="4" className="text-center py-6">
                  No Data Found
                </td>
              </tr>
            ) : (
              currentData.map((item, index) => (
                <tr
                  key={index}
                  className="border-b border-slate-100 hover:bg-indigo-50/50 transition"
                >
                  {/* Item Name */}
                  <td className="px-4 py-3 font-medium text-gray-700">
                    {item.item_name}
                  </td>

                  {/* Quantity with Low Stock Hover */}
                  <td className="px-4 py-3 relative group">
                    {item.qty < 5 ? (
                      <>
                        <span className="bg-red-600 text-white px-3 py-1 rounded-full text-sm font-semibold cursor-pointer animate-pulse">
                          {item.qty}
                        </span>

                        <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-48 
                                        bg-red-600 text-white text-xs rounded-lg p-2 
                                        opacity-0 group-hover:opacity-100 
                                        transition duration-300 shadow-lg z-10">
                          ⚠ Critical Stock Level  
                          <br />
                          Only {item.qty} items remaining!
                        </div>
                      </>
                    ) : item.qty < 10 ? (
                      <>
                        <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-sm font-semibold cursor-pointer">
                          {item.qty}
                        </span>

                        <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-44 
                                        bg-red-500 text-white text-xs rounded-lg p-2 
                                        opacity-0 group-hover:opacity-100 
                                        transition duration-300 shadow-lg z-10">
                          ⚠ Low Stock Alert  
                          <br />
                          Only {item.qty} items remaining
                        </div>
                      </>
                    ) : (
                      <span className="bg-green-100 text-green-600 px-3 py-1 rounded-full text-sm font-semibold">
                        {item.qty}
                      </span>
                    )}
                  </td>

                  {/* Type */}
                  <td className="px-4 py-3 text-gray-600">
                    {item.type}
                  </td>

                  {/* Price */}
                  <td className="px-4 py-3 text-gray-600">
                    {item.price ? `$${Number(item.price).toFixed(2)}` : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex justify-between items-center p-4 bg-gray-50">
          <span className="text-sm text-gray-600">
            Page {currentPage} of {totalPages || 1}
          </span>

          <div className="space-x-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
              className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300"
            >
              Prev
            </button>

            <button
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(currentPage + 1)}
              className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
