const jwt = require("jsonwebtoken");

// Define some constants
const ACESS_SECRET_KEY = `access-secret-key`; // The secret key for signing jwt tokens
const REFRESH_SECRET_KEY = "refresh-secret-key";
const SALT_ROUNDS = 10; // The number of salt rounds for hashing passwords
const allowedHosts = ["http://localhost:3001", "http://localhost:3002"];
const bcrypt = require("bcryptjs");

// A helper function to create a token from a payload
const createToken = (data, type) => {
  const payload = { ...data, date: (new Date() * Math.random()).toString(16) };
  if (type === "access") {
    return jwt.sign(payload, ACESS_SECRET_KEY, { expiresIn: "30m" });
  } else if (type === "refresh") {
    return jwt.sign(payload, REFRESH_SECRET_KEY, { expiresIn: "1d" });
  }
};

const setRefreshToken = (payload, res, db) => {
  const refresh = createToken(payload, "refresh");
  res.cookie("refreshToken", refresh, { httpOnly: true });
  db.get("data")
    .get("users")
    .find({ id: payload.id })
    .assign({ refresh })
    .write();
};

// A helper function to verify a token and get the decoded data
const verifyToken = (token, type) => {
  return jwt.verify(
    token,
    type === "access" ? ACESS_SECRET_KEY : REFRESH_SECRET_KEY,
    (err, decode) => (decode !== undefined ? decode : err)
  );
};

// Create a middleware function that checks the request origin
const checkOrigin = (req, res, next) => {
  // Get the origin from the request headers
  const origin = req.headers.origin;
  // If the origin is in the allowed hosts, proceed to the next middleware
  if (allowedHosts.includes(origin)) {
    next();
  } else {
    // Otherwise, send a 403 forbidden response
    res.status(403).send("Access denied");
  }
};

const hashPassword = (req, res, next) => {
  if (
    ["POST", "PUT"].includes(req.method) &&
    req.path !== "/login" &&
    req.body.password
  ) {
    // Hash the password with bcrypt
    bcrypt.hash(req.body.password, SALT_ROUNDS, (err, hash) => {
      if (err) {
        // Handle hashing error
        res.status(500).send(err.message);
      } else {
        // Replace the plain password with the hashed one
        req.body.password = hash;
        next();
      }
    });
  } else {
    next();
  }
};

const register = (db) => (req, res) => {
  // Get the user data from the request body
  const { name, email, password, roles = ["USER"] } = req.body;

  // Check if the username is already taken
  const existingUser = db
    .get("data")
    .get("users")
    .find({ email: email.toLowerCase() })
    .value();

  if (existingUser) {
    // Return a 409 Conflict response
    res.status(409).send("email already exists");
  } else {
    // Create a new user record
    const payload = {
      id: new Date().getTime().toString(16),
      name,
      email: email.toLowerCase(),
      roles,
    };
    db.get("data")
      .get("users")
      .push({ ...payload, name, password })
      .write();

    // Create a token for the new user
    const token = createToken(payload, "access");

    setRefreshToken(payload, res, db);

    // Return a 201 Created response with the token
    res.status(201).json({ accessToken: token });
  }
};

const login = (db) => (req, res) => {
  // Get the credentials from the request body
  const { email, password } = req.body;

  // Find the user by username
  const user = db
    .get("data")
    .get("users")
    .find({ email: email.toLowerCase() })
    .value();
  if (user) {
    // Compare the password with the hashed one
    bcrypt.compare(password, user.password, (err, result) => {
      if (err) {
        // Handle comparison error
        res.status(500).send(err.message);
      } else {
        if (result) {
          const payload = {
            id: user.id,
            email: email.toLowerCase(),
            name: user.name,
            roles: user.roles,
          };
          // Passwords match, create a token for the user
          const token = createToken(payload, "access");
          // set refresh token in database and coockie
          setRefreshToken(payload, res, db);
          // Return a 200 OK response with the token
          res.status(200).json({ accessToken: token });
        } else {
          // Passwords don't match, return a 401 Unauthorized response
          res.status(401).send("Invalid credentials");
        }
      }
    });
  } else {
    // User not found, return a 404 Not Found response
    res.status(404).send("User not found");
  }
};

const refresh = (db) => (req, res) => {
  // Get the refresh token from the cookie
  const refreshToken = req.cookies.refreshToken;

  // Verify the refresh token
  const decoded = verifyToken(refreshToken, "refresh");

  // Check if the refresh token is valid and not expired
  if (decoded && !decoded.message) {
    // Find the user by id
    const user = db.get("data").get("users").find({ id: decoded.id }).value();

    // Check if the refresh token matches the one in the database
    if (user && user.refresh === refreshToken) {
      // Create a new access token
      const accessToken = createToken(
        {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles,
        },
        "access"
      );

      // Token is valid, set the user id and roles in the request object
      req.userId = decoded.id;
      req.userRoles = decoded.roles;
      // Return a 200 OK response with the new access token
      res.status(200).json({ accessToken: accessToken });
    } else {
      // Refresh token does not match, return a 401 Unauthorized response
      res.status(401).send("Invalid refresh token");
    }
  } else {
    // Refresh token is invalid or expired, return a 401 Unauthorized response
    res.status(401).send("Invalid refresh token");
  }
};

const logout = (db) => (req, res) => {
  const refresh = req.cookies.refreshToken;
  if (!refresh) {
    res.status(204);
  } else {
    res.clearCookie("refreshToken", { httpOnly: true });
    const user = db.get("data").get("users").find({ refresh });
    if (!user.value()) {
      res.sendStatus(204);
    } else {
      const userValue = user.value();
      delete userValue.refresh;
      user.assign({ ...userValue }).write();
      res.sendStatus(204);
    }
  }
};

// A middleware to check the authorization header for a valid token
const checkAuth = (req, res, next) => {
  // Get the authorization header from the request
  const authorization = req.headers.authorization || req.headers.Authorization;

  if (req.path !== "/refresh") {
    // Check if the authorization header is present and has the format 'Bearer token'
    if (authorization && authorization.split(" ")[0] === "Bearer") {
      // Get the token from the authorization header
      const token = authorization.split(" ")[1];

      // Verify the token and get the decoded data
      const decoded = verifyToken(token, "access");
      // Check if the token is valid
      if (decoded && !decoded.message) {
        // Token is valid, set the user id and roles in the request object
        req.userId = decoded.id;
        req.userRoles = decoded.roles;
        next();
      } else {
        // Token is invalid, return a 401 Unauthorized response
        res.status(401).send("Invalid token");
      }
    } else {
      // Authorization header is not present or has a wrong format, return a 401 Unauthorized response
      res.status(401).send("Authorization header required");
    }
  } else {
    next();
  }
};

module.exports = {
  checkOrigin,
  hashPassword,
  register,
  login,
  refresh,
  logout,
  checkAuth,
};
