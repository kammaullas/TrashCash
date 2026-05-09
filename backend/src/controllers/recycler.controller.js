import bcrypt from "bcryptjs";
import { generateToken } from "../utils/jwt.js";
import Recycler from "../models/recycler.model.js";
import Collection from "../models/collection.model.js";
import Transporter from "../models/transporter.model.js";
import RevenueRequest from "../models/RevenueRequest.model.js";

const register = async (req, res) => {
    try {
        const { name, email, password, address, city, state, zipCode } = req.body;
        console.log("📥 Registration request received for:", { name, email });

        if (!name || !email || !password || !address || !city || !state || !zipCode) {
            console.warn("⚠️ Missing required fields for registration.");
            return res.status(400).json({ message: "Name, email, password, and full address are required" });
        }

        const existingRecyclerByEmail = await Recycler.findOne({ email });
        if (existingRecyclerByEmail) {
            console.warn("❌ Registration failed: Email already exists:", email);
            return res.status(409).json({ message: "Recycler with this email already exists" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        console.log("🔑 Password hashed for recycler:", email);

        const newRecycler = new Recycler({
            name,
            email,
            password: hashedPassword,
            location: {
                address,
                city,
                state,
                zipCode
            }
        });

        await newRecycler.save();
        console.log("✅ New recycler saved to database with ID:", newRecycler._id);

        generateToken(newRecycler._id, res);
        console.log("✅ Token generated for new recycler:", newRecycler._id);

        const { password: pwd, ...recyclerData } = newRecycler.toObject();

        res.status(201).json({
            message: "Recycler registered successfully",
            recycler: recyclerData
        });

    } catch (error) {
        console.error("💥 Registration error:", error);
        res.status(500).json({ message: "Server error during registration" });
    }
};


const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log("📥 Login request received for:", { email });

        if (!email || !password) {
            console.warn("⚠️ Missing email or password.");
            return res.status(400).json({ message: "Please provide both your email and password" });
        }

        const recycler = await Recycler.findOne({ email });
        console.log("🔍 Recycler lookup result:", recycler ? recycler._id : "Not found");

        if (!recycler || !(await bcrypt.compare(password, recycler.password))) {
            console.warn("❌ Login failed: Invalid credentials for:", email);
            return res.status(401).json({ message: "Invalid credentials" });
        }

        generateToken(recycler._id, res);
        console.log("✅ Token generated for recycler:", recycler._id);

        const { password: pwd, ...recyclerData } = recycler.toObject();
        console.log("✅ Login successful. Recycler data:", recyclerData);

        res.status(200).json({
            message: "Login successful",
            recycler: recyclerData
        });

    } catch (error) {
        console.error("💥 Login error:", error);
        res.status(500).json({ message: "Server error during login" });
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

const checkUser = async (req, res) => {
    try {
        // The middleware has already populated req.user with an ID
        const recycler = await Recycler.findById(req.user.id).select("-password");
        if (!recycler) {
            return res.status(404).json({ message: "Recycler not found" });
        }
        console.log("✅ checkUser successful for:", recycler.email);
        res.status(200).json({ recycler: recycler });
    } catch (error) {
        console.error("💥 Error in checkUser:", error);
        res.status(500).json({ message: "Server error" });
    }
};

const updateProfile = async (req, res) => {
    try {
        const recyclerId = req.user.id;
        const { name, email, address, city, state, zipCode } = req.body;

        const updateData = { location: {} };
        if (name) updateData.name = name;

        // Handle uniqueness constraints if email is being updated
        if (email) {
            const existing = await Recycler.findOne({ email, _id: { $ne: recyclerId } });
            if (existing) return res.status(409).json({ message: "Email is already in use." });
            updateData.email = email;
        }

        // Fetch current user to merge address fields
        const currentUser = await Recycler.findById(recyclerId);
        updateData.location.address = address || currentUser.location.address;
        updateData.location.city = city || currentUser.location.city;
        updateData.location.state = state || currentUser.location.state;
        updateData.location.zipCode = zipCode || currentUser.location.zipCode;

        const updatedRecycler = await Recycler.findByIdAndUpdate(
            recyclerId,
            { $set: updateData },
            { new: true, runValidators: true }
        ).select("-password");

        if (!updatedRecycler) {
            return res.status(404).json({ message: "Recycler not found" });
        }

        res.status(200).json({
            message: "Profile updated successfully",
            recycler: updatedRecycler
        });

    } catch (error) {
        console.error("💥 Profile update error:", error);
        res.status(500).json({ message: "Server error during profile update" });
    }
};

const scanQRCode = async (req, res) => {
    try {
        const { scannedTransporterId } = req.body;
        const recyclerId = req.user?.id;

        if (!recyclerId) {
            return res.status(401).json({ message: "Unauthorized: Recycler ID missing." });
        }
        if (!scannedTransporterId) {
            return res.status(400).json({ message: "Scanned QR code data is missing." });
        }

        const transporter = await Transporter.findById(scannedTransporterId);
        if (!transporter) {
            return res.status(404).json({ message: "Transporter not found from QR code." });
        }

        const updateResult = await Collection.updateMany(
            {
                transporter: scannedTransporterId,
                status: 'Collected',
                recycler: { $exists: false }
            },
            { $set: { recycler: recyclerId, status: "Trash Dumped" } }
        );

        if (updateResult.modifiedCount === 0) {
            return res.status(200).json({
                message: `No new collections were available to be claimed from ${transporter.name}.`,
                claimedCount: 0
            });
        }

        res.status(200).json({
            message: `Successfully claimed ${updateResult.modifiedCount} collections from ${transporter.name}.`,
            claimedCount: updateResult.modifiedCount,
        });

    } catch (error) {
        console.error("💥 QR Scan processing error:", error);
        res.status(500).json({ message: "Server error while processing the scan.", error: error.message });
    }
};

const getRecyclerHistory = async (req, res) => {
    try {
        const recyclerId = req.user.id;
        console.log(`🔍 Fetching history for recycler ID: ${recyclerId}`);

        const history = await Collection.find({ recycler: recyclerId })
            .populate('user', 'name')
            .populate('transporter', 'name')
            .sort({ updatedAt: -1 });

        if (!history || history.length === 0) {
            return res.status(200).json({ message: "No history found.", history: [] });
        }

        console.log(`✅ Found ${history.length} history records for recycler.`);
        res.status(200).json({ history });

    } catch (error) {
        console.error("💥 Error fetching recycler history:", error);
        res.status(500).json({ message: "Server error while fetching history." });
    }
};

const getPendingCollections = async (req, res) => {
    try {
        const recyclerId = req.user.id;

        // Find all collections that have been dumped but not yet completed (paid for)
        const collections = await Collection.find({
            recycler: recyclerId,
            status: 'Trash Dumped'
        });

        if (collections.length === 0) {
            return res.status(200).json({
                message: "No pending collections to process for revenue.",
                summary: { totalWeight: 0, wet: 0, dry: 0, hazardous: 0, collectionIds: [] }
            });
        }

        // Calculate a summary of the waste to show the recycler
        const summary = collections.reduce((acc, doc) => {
            acc.totalWeight += doc.weight;
            acc.wet += doc.wasteTypes.wet || 0;
            acc.dry += doc.wasteTypes.dry || 0;
            acc.hazardous += doc.wasteTypes.hazardous || 0;
            acc.collectionIds.push(doc._id);
            return acc;
        }, { totalWeight: 0, wet: 0, dry: 0, hazardous: 0, collectionIds: [] });

        res.status(200).json({ summary });

    } catch (error) {
        console.error("💥 Error fetching pending collections:", error);
        res.status(500).json({ message: "Server error while fetching pending collections" });
    }
};

// --- NEW: Controller to submit the revenue request to the admin ---
const submitRevenueRequest = async (req, res) => {
    try {
        const recyclerId = req.user.id;
        const { wastePrices, collectionIds } = req.body;

        // Basic validation
        if (!wastePrices || !collectionIds || collectionIds.length === 0 || !wastePrices.wet || !wastePrices.dry || !wastePrices.hazardous) {
            return res.status(400).json({ message: "Prices for all waste types and a list of collections are required." });
        }

        // Security check: Verify the collections belong to this recycler and are in the correct state
        const collections = await Collection.find({
            '_id': { $in: collectionIds },
            'recycler': recyclerId,
            'status': 'Trash Dumped'
        });

        // If the number of found collections doesn't match, it means some were invalid or already processed
        if (collections.length !== collectionIds.length) {
            return res.status(400).json({ message: "Data mismatch. Some collections may have already been processed. Please refresh and try again." });
        }

        // Calculate the total revenue based on the prices submitted by the recycler
        const totalCalculatedRevenue = collections.reduce((total, collection) => {
            const wetValue = (collection.wasteTypes.wet || 0) * (parseFloat(wastePrices.wet) || 0);
            const dryValue = (collection.wasteTypes.dry || 0) * (parseFloat(wastePrices.dry) || 0);
            const hazardousValue = (collection.wasteTypes.hazardous || 0) * (parseFloat(wastePrices.hazardous) || 0);
            return total + wetValue + dryValue + hazardousValue;
        }, 0);

        // Create the request document for admin approval
        const newRequest = new RevenueRequest({
            recycler: recyclerId,
            collections: collectionIds,
            wastePrices,
            totalCalculatedRevenue: totalCalculatedRevenue
        });

        await newRequest.save();

        res.status(201).json({ message: "Revenue request submitted successfully and is now pending admin approval." });

    } catch (error) {
        console.error("💥 Error submitting revenue request:", error);
        res.status(500).json({ message: "Server error during revenue submission" });
    }
};


export { register, login, logout, checkUser, updateProfile, scanQRCode, getRecyclerHistory, getPendingCollections, submitRevenueRequest };