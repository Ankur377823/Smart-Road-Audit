import { Navigate, useLocation } from "react-router-dom";

import { isSignedIn, loginPath } from "../../services/session";

/** Sends signed-out visitors to the sign-in page, then back to the page they asked for. */
function RequireAuth({ children }) {
  const location = useLocation();

  if (!isSignedIn()) {
    return <Navigate to={loginPath(location.pathname + location.search)} replace />;
  }
  return children;
}

export default RequireAuth;
