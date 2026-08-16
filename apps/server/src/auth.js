import jwt from "jsonwebtoken"
import User from "./model/User.model.js"

const JWT_SECRET = process.env.JWT_SECRET
const JWT_EXPIRY = process.env.JWT_EXPIRY

export function issueGuestToken(){
    const userId = "guest-"+ Math.random().toString(36).slice(2,10)
    const name = "Guest-" + Math.floor(Math.random()*1000)

    const token = jwt.sign({userId,name},JWT_SECRET,{
        expiresIn: JWT_EXPIRY
    })

    return {token, userId, name}
}

export function verifyToken(token){
    try {
       return  jwt.verify(token, JWT_SECRET)
    } catch (error) {
        return null;
    }
}

export function issueUserToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email, name: user.name, guest: false },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

export async function signup({ email, password, name }) {
  const existing = await User.findOne({ email });
  if (existing) {
    const err = new Error("Email already registered");
    err.status = 409;
    throw err;
  }
  const passwordHash = await User.hashPassword(password);
  const user = await User.create({ email, passwordHash, name });
  return { token: issueUserToken(user), user };
}

export async function login({ email, password }) {
  const user = await User.findOne({ email });
  if (!user || !(await user.comparePassword(password))) {
    const err = new Error("Invalid email or password");
    err.status = 401;
    throw err;
  }
  return { token: issueUserToken(user), user };
}

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  try {
    const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
    req.user = decoded; // { sub, email, name, guest }
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}