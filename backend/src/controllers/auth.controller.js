import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import cloudinary from "../config/cloudinary.js";
import User from "../models/user.model.js";
import { generateToken } from "../utils/jwt.js";
import Collection from "../models/collection.model.js";

const login = async (req, res) => {
    try {
        const { loginId, password } = req.body;
        console.log("📥 Login request received:", { loginId });

        if (!loginId || !password) {
            return res.status(400).json({ message: "Please enter your email and password" });
        }

        // Find user by email
        const user = await User.findOne({ email: loginId });
        console.log("🔍 User lookup result:", user ? user._id : "Not found");

        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        generateToken(user._id, res);

        const { password: pwd, ...userData } = user.toObject();
        res.status(200).json({
            message: "Login successful",
            user: userData
        });

    } catch (error) {
        console.error("💥 Login error:", error);
        res.status(500).json({ message: "Server error" });
    }
};


const register = async (req, res) => {
    try {
        const { name, email, password, street, city, state, pinCode } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: "Name, email, and password are required" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "This email is already registered." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            address: { street, city, state, pinCode },
            isVerified: true,
        });

        // Generate and upload QR code
        const qrDataUrl = await QRCode.toDataURL(user._id.toString());
        const uploadResult = await cloudinary.uploader.upload(qrDataUrl, {
            folder: "qr_codes",
            public_id: `qr_${user._id}`,
            overwrite: true
        });
        user.qrCodeUrl = uploadResult.secure_url;
        await user.save();

        generateToken(user._id, res);

        const { password: pwd, ...userData } = user.toObject();
        res.status(201).json({
            message: "Registration successful!",
            user: userData
        });

    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ message: "Server error" });
    }
};


const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required." });
        }

        const user = await User.findOne({ email });
        if (!user) {
            // Generic message to avoid user enumeration
            return res.status(200).json({ message: "If an account with this email exists, a reset token has been sent." });
        }

        // Generate a simple 6-digit numeric token (stored as plain text for simplicity)
        const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
        const resetTokenExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

        user.otp = await bcrypt.hash(resetToken, 10);
        user.otpExpires = resetTokenExpires;
        await user.save();

        // TODO: Send resetToken via email (e.g. using nodemailer)
        // For now, log it to the console for development
        console.log(`🔑 Password reset token for ${email}: ${resetToken}`);

        res.status(200).json({ message: "If an account with this email exists, a reset token has been sent." });

    } catch (error) {
        console.error("Forgot Password error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        if (!email || !otp || !newPassword) {
            return res.status(400).json({ message: "Email, token, and new password are required." });
        }

        const user = await User.findOne({
            email,
            otpExpires: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).json({ message: "Invalid token, user not found, or token has expired." });
        }

        const isMatch = await bcrypt.compare(otp, user.otp);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid token." });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        res.status(200).json({ message: "Password has been reset successfully. Please log in." });

    } catch (error) {
        console.error("Reset Password error:", error);
        res.status(500).json({ message: "Server error" });
    }
};


const logout = (req, res) => {
    try {
        res.cookie("jwt", "", { maxAge: 0 });
        res.status(200).json({ message: "Logout successful" });
    } catch (err) {
        console.error("error in logout:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;

        const { name, street, city, state, pinCode } = req.body;

        const updateData = {};
        if (name) updateData.name = name;
        if (street || city || state || pinCode) {
            updateData.address = {};
            if (street) updateData.address.street = street;
            if (city) updateData.address.city = city;
            if (state) updateData.address.state = state;
            if (pinCode) updateData.address.pinCode = pinCode;
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: updateData },
            { new: true, runValidators: true }
        ).select("-password");

        res.status(200).json({
            message: "Profile updated successfully",
            user: updatedUser
        });

    } catch (error) {
        console.error("Update Profile Error:", error);
        res.status(500).json({ message: "Server error while updating profile" });
    }
};

const checkUser = async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await User.findById(userId).select("-password");

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({
            message: "User authenticated",
            user
        });
    } catch (error) {
        console.error("Check User Error:", error);
        res.status(500).json({ message: "Server error while checking user" });
    }
};

const getQR = async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await User.findById(userId).select("qrCodeUrl");

        if (!user || !user.qrCodeUrl) {
            return res.status(404).json({ message: "QR code not found" });
        }

        res.status(200).json({
            message: "QR code retrieved successfully",
            qrCodeUrl: user.qrCodeUrl
        });
    } catch (error) {
        console.error("Get QR Error:", error);
        res.status(500).json({ message: "Server error while retrieving QR code" });
    }
};

const getCollections = async (req, res) => {
    try {
        const userId = req.user.id;

        const collections = await Collection.find({ user: userId })
            .populate("transporter", "name email")
            .sort({ createdAt: -1 });

        if (!collections.length) {
            return res.status(404).json({ message: "No collection history found" });
        }

        res.status(200).json({
            message: "Collection history retrieved successfully",
            count: collections.length,
            collections
        });
    } catch (error) {
        console.error("Get Collections Error:", error);
        res.status(500).json({ message: "Server error while retrieving collections" });
    }
};

const getWallet = async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await User.findById(userId).select("walletBalance");

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({
            message: "Wallet balance retrieved successfully",
            walletBalance: user.walletBalance
        });
    } catch (error) {
        console.error("Get Wallet Error:", error);
        res.status(500).json({ message: "Server error while retrieving wallet balance" });
    }
};

export { login, register, logout, updateProfile, checkUser, getQR, getCollections, getWallet, forgotPassword, resetPassword };