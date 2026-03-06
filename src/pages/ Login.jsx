import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function Login({ setUser }) { // <-- receive setUser from App.js
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();

        if (!username.trim() || !password) {
            return Swal.fire("Error", "Please enter username and password", "error");
        }

        try {
            const { data, error } = await supabase
                .from("user")
                .select("*")
                .eq("username", username.trim())
                .single();

            if (error || !data) return Swal.fire("Error", "User not found", "error");
            if (data.password !== password) return Swal.fire("Error", "Wrong password", "error");

            // Save user to localStorage
            localStorage.setItem("user", JSON.stringify(data));

            // Update App.js state
            if (setUser) setUser(data);

            Swal.fire("Success", "Logged in!", "success").then(() => {
                navigate("/dashboard"); // redirect to dashboard
            });
        } catch (err) {
            console.error(err);
            Swal.fire("Error", "Something went wrong", "error");
        }
    };

  return (
  <div className="fixed inset-0 bg-white overflow-hidden flex items-center justify-center px-4">

    <div className="
      w-full
      max-w-sm
      sm:max-w-md
      bg-white
      rounded-2xl
      shadow-2xl
      p-6
      sm:p-8
      border
    ">

      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">
          Myat Taw Win (Aye Thar Yar ) Hospital
        </h2>
        <p className="text-xs sm:text-sm text-gray-500">
          Sign in to continue
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">

        {/* Username */}
        <div>
          <label className="text-xs sm:text-sm text-gray-600">
            Username
          </label>
          <input
            type="text"
            placeholder="Enter username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="
              mt-1
              w-full
              px-3
              sm:px-4
              py-2.5
              rounded-lg
              border
              border-gray-300
              focus:ring-2
              focus:ring-blue-500
              focus:outline-none
            "
          />
        </div>

        {/* Password */}
        <div>
          <label className="text-xs sm:text-sm text-gray-600">
            Password
          </label>
          <input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="
              mt-1
              w-full
              px-3
              sm:px-4
              py-2.5
              rounded-lg
              border
              border-gray-300
              focus:ring-2
              focus:ring-blue-500
              focus:outline-none
            "
          />
        </div>

        {/* Button */}
        <button
          type="submit"
          className="
            w-full
            py-2.5
            sm:py-3
            rounded-lg
            bg-blue-600
            text-white
            font-semibold
            hover:bg-blue-700
            active:scale-[0.98]
            transition
          "
        >
          Login
        </button>
      </form>

      {/* Footer */}
      <p className="text-center text-[10px] sm:text-xs text-gray-400 mt-6">
        © 2026 Myat Taw Win Hospital
      </p>
    </div>

  </div>
);



}
