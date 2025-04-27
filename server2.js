const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const app = express();

app.use(express.json());
app.use(cors());

// --- MongoDB Connection for User Server ---
mongoose.connect(
    'mongodb+srv://sfayazmr:Abcdef067@cluster01.ibbs2.mongodb.net/bustrack?retryWrites=true&w=majority&appName=Cluster01', // Replace with your actual connection string
    { useNewUrlParser: true, useUnifiedTopology: true }
).then(() => console.log('User server connected to MongoDB'))
    .catch((error) => console.error('User server MongoDB connection error:', error));

// --- Driver Model Definition ---
const driverSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    busNumber: { type: String, required: true },
    isTracking: { type: Boolean, default: false },
    route: { type: mongoose.Schema.Types.ObjectId, ref: 'Route' },
});
const Driver = mongoose.model("Driver", driverSchema);

// --- Route Model Definition ---
const routeSchema = new mongoose.Schema({
    busNumber: { type: String, required: true, unique: true },
    routeName: String,
    stops: [
        {
            locationName: { type: String, required: true },
            latitude: { type: Number, required: true },
            longitude: { type: Number, required: true },
            distanceFromPrevious: { type: Number, default: 0 },
            estimatedTimeFromPrevious: { type: Number, default: 0 },
        },
    ],
});
const Route = mongoose.model("Route", routeSchema);

// --- API Endpoint to Fetch Driver and Route Data by Bus Number ---
app.get('/api/user/driver/by-bus/:busNumber', async (req, res) => {
    const { busNumber } = req.params;
    try {
        const driver = await Driver.findOne({ busNumber }).populate('route');
        if (!driver) {
            return res.status(404).json({ message: `Driver with bus number ${busNumber} not found.` });
        }
        res.json(driver);
    } catch (error) {
        console.error('Error fetching driver and route data by bus number:', error);
        res.status(500).json({ message: 'Failed to fetch driver and route data.', error: error.message });
    }
});

// --- API Endpoint to Fetch Latest Driver Location (using driverId) ---
const DRIVER_API_BASE_URL = 'https://bustrack-zjyo.onrender.com/api'; // Adjust if your driver server is running elsewhere

app.get('/api/user/driver/:driverId/live-location', async (req, res) => {
    const { driverId } = req.params;
    try {
        const response = await fetch(`${DRIVER_API_BASE_URL}/user/driver/${driverId}/latest-location`);
        if (!response.ok) {
            const errorBody = await response.json();
            console.error('Error fetching driver location from driver server:', errorBody);
            return res.status(response.status).json({ message: 'Failed to fetch driver location from driver server', error: errorBody });
        }
        const locationData = await response.json();
        console.log('Location Data received from driver server:', locationData);

        // Format the timestamp to IST
        if (locationData && locationData.timestamp) {
            const timestamp = new Date(locationData.timestamp);
            const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
            const istTime = new Date(timestamp.getTime() + istOffset);
            const formattedTime = istTime.toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            locationData.formattedTimeIST = formattedTime;
        }

        res.json(locationData);
    } catch (error) {
        console.error('Error communicating with driver server:', error);
        res.status(500).json({ message: 'Failed to communicate with driver server', error: error.message });
    }
});

// --- Server Startup for User Server ---
const userPort = 5002;
app.listen(userPort, () => console.log(`User server running on port ${userPort}`));