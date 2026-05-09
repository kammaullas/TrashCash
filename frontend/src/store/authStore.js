import { create } from "zustand";
import axios from "axios";
import toast from "react-hot-toast";

axios.defaults.withCredentials = true;
const API_URL = import.meta.env.VITE_API_URL || "https://trashcash.onrender.com";

export const useAuthStore = create((set) => ({
    currentUser: null,
    role: null,
    loading: true,
    updateCurrentUser: (user) => {
        set({ currentUser: user });
    },
    // --- User login/register ---
    loginUser: async (data) => {
        try {
            const res = await axios.post(`${API_URL}/api/auth/login`, data);
            set({ currentUser: res.data.user, role: "user" });
            toast.success("User logged in successfully!");
        } catch (error) {
            console.error("Login user failed:", error.response?.data || error.message);
            toast.error(error.response?.data?.message || "User login failed!");
        }
    },

    registerUser: async (data) => {
        try {
            const res = await axios.post(`${API_URL}/api/auth/register`, data);
            set({ currentUser: res.data.user, role: "user" });
            toast.success("Registration successful!");
            return res.data;
        } catch (error) {
            console.error("Register user failed:", error.response?.data || error.message);
            toast.error(error.response?.data?.message || "User registration failed!");
            throw error;
        }
    },

    // --- User password reset (Removed) ---

    // --- Transporter login/register ---
    loginTransporter: async (data) => {
        try {
            const res = await axios.post(`${API_URL}/api/transporter/login`, data);
            set({ currentUser: res.data.transporter, role: "transporter" });
            toast.success("Transporter logged in successfully!");
        } catch (error) {
            console.error("Login transporter failed:", error.response?.data || error.message);
            toast.error(error.response?.data?.message || "Transporter login failed!");
        }
    },

    registerTransporter: async (data) => {
        try {
            const res = await axios.post(`${API_URL}/api/transporter/register`, data);
            set({ currentUser: res.data.transporter, role: "transporter" });
            toast.success("Transporter registered successfully!");
        } catch (error) {
            console.error("Register transporter failed:", error.response?.data || error.message);
            toast.error(error.response?.data?.message || "Transporter registration failed!");
        }
    },

    // --- Recycler ---
    loginRecycler: async (data) => {
        set({ loading: true });
        try {
            const res = await axios.post(`${API_URL}/api/recycler/login`, data);
            console.log("✅ Recycler Login Response:", res.data);
            set({ currentUser: res.data.recycler, role: "recycler", loading: false });
            toast.success("Recycler logged in successfully!");
        } catch (error) {
            console.error("Login recycler failed:", error.response?.data || error.message);
            toast.error(error.response?.data?.message || "Recycler login failed!");
            set({ loading: false });
        }
    },

    // --- Logout (Updated) ---
    logout: async () => {
        try {
            set((state) => {
                if (state.role === "user") axios.post(`${API_URL}/api/auth/logout`);
                if (state.role === "transporter") axios.post(`${API_URL}/api/transporter/logout`);
                if (state.role === "recycler") axios.post(`${API_URL}/api/recycler/logout`);

                toast.success("Logged out successfully!");
                return { currentUser: null, role: null };
            });
        } catch (error) {
            console.error("Logout failed:", error.response?.data || error.message);
            toast.error(error.response?.data?.message || "Logout failed!");
        }
    },

    // --- checkAuth (Added Detailed Logging) ---
    checkAuth: async () => {
        set({ loading: true });

        const authChecks = [
            { role: "user", url: `${API_URL}/api/auth/check-user`, key: "user" },
            { role: "transporter", url: `${API_URL}/api/transporter/check-user`, key: "transporter" },
            { role: "recycler", url: `${API_URL}/api/recycler/check-user`, key: "recycler" },
        ];

        for (const check of authChecks) {
            try {
                const res = await axios.get(check.url);

                if (res.data && res.data[check.key]) {
                    set({
                        currentUser: res.data[check.key],
                        role: check.role,
                        loading: false,
                    });
                    return;
                }
            } catch (error) {
                // Ignore 401 errors during checkAuth as they are expected when logged out
                if (error.response?.status !== 401) {
                    console.error(`Error checking auth for ${check.role}:`, error.message);
                }
            }
        }

        set({ currentUser: null, role: null, loading: false });
    },
}));