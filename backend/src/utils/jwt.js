import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();
const generateToken = (userId, res) => {
    const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
        expiresIn: "7d"
    });
    res.cookie("jwt", token, {
        httpOnly: true,
        secure: true, // Required for sameSite: 'none'
        sameSite: "none", // Required for cross-domain cookies (Vercel to Render)
        maxAge: 7 * 24 * 60 * 60 * 1000 
    });
    return token;
}

export { generateToken };