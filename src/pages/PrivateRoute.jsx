import { Navigate } from "react-router-dom";

/**
 * PrivateRoute component
 * - children: the component to render if allowed
 * - user: the currently logged-in user (pass from App.js)
 * - allowedRoles: optional array of roles allowed to view this route
 */
export default function PrivateRoute({ children, user, allowedRoles }) {
  // If no user is logged in, redirect to login
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // If allowedRoles is set, check if user's role is allowed
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />; // redirect to dashboard if not allowed
  }

  // Otherwise, render the children
  return children;
}
