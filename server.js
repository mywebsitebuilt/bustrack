const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const app = express();

app.use(express.json());
app.use(cors());

mongoose.connect(
    'mongodb+srv://sfayazmr:Abcdef067@cluster01.ibbs2.mongodb.net/bustrack?retryWrites=true&w=majority&appName=Cluster01',
    { useNewUrlParser: true, useUnifiedTopology: true }
).then(() => console.log('Connected to MongoDB'))
    .catch((error) => console.error('Error connecting to MongoDB:', error));

// ... (User and Admin models - omitted for brevity, but they are in the original code)

// Driver Model
const driverSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    busNumber: { type: String, required: true },
    isTracking: { type: Boolean, default: false }, // Add isTracking field
    route: { type: mongoose.Schema.Types.ObjectId, ref: 'Route' }, // Add route reference
});
const Driver = mongoose.model("Driver", driverSchema);

// Route Model
const routeSchema = new mongoose.Schema({
    busNumber: { type: String, required: true, unique: true }, // Link route to a specific bus
    routeName: String, // Optional descriptive name for the route
    stops: [
        {
            locationName: { type: String, required: true },
            latitude: { type: Number, required: true },
            longitude: { type: Number, required: true },
            distanceFromPrevious: { type: Number, default: 0 }, // Distance to this stop from the previous
            estimatedTimeFromPrevious: { type: Number, default: 0 }, // Estimated time from the previous (in minutes)
        },
    ],
});
const Route = mongoose.model("Route", routeSchema);

// Location Model
const locationSchema = new mongoose.Schema({
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
});
const Location = mongoose.model("Location", locationSchema);

// ... (JWT secret)
const DRIVER_JWT_SECRET = 'driver-secret-key'; // Separate secret for driver tokens


// --- Authentication Middleware for Driver Routes ---
const authenticateDriver = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ message: 'Driver authentication required' });
        }
        const decoded = jwt.verify(token, DRIVER_JWT_SECRET);
        const driver = await Driver.findById(decoded.driverId).populate('route'); // Populate the route
        if (!driver) {
            return res.status(401).json({ message: 'Invalid driver token' });
        }
        req.driver = driver;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Invalid driver token' });
    }
};

// --- Driver Authentication and Location Tracking ---

app.post('/api/driver/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const driver = await Driver.findOne({ username });
        if (!driver || !(await bcrypt.compare(password, driver.password))) {
            return res.status(401).json({ message: 'Invalid driver credentials' });
        }
        const token = jwt.sign({ driverId: driver._id }, DRIVER_JWT_SECRET, { expiresIn: '2h' }); // Longer expiry
        res.json({ token, driverId: driver._id, busNumber: driver.busNumber, message: 'Driver login successful' });
    } catch (error) {
        console.error('Driver login error:', error);
        res.status(500).json({ message: 'Failed to login driver' });
    }
});

// Start/Stop Tracking
app.post('/api/driver/tracking/start', authenticateDriver, async (req, res) => {
    try {
        req.driver.isTracking = true;
        await req.driver.save();
        res.json({ message: 'Tracking started' });
    } catch (error) {
        console.error('Error starting tracking:', error);
        res.status(500).json({ message: 'Failed to start tracking' });
    }
});

app.post('/api/driver/tracking/stop', authenticateDriver, async (req, res) => {
    try {
        req.driver.isTracking = false;
        await req.driver.save();
        res.json({ message: 'Tracking stopped' });
    } catch (error) {
        console.error('Error stopping tracking:', error);
        res.status(500).json({ message: 'Failed to stop tracking' });
    }
});

// Location Update
app.post('/api/driver/location', authenticateDriver, async (req, res) => {
    try {
        const { latitude, longitude } = req.body;
        if (!req.driver.isTracking) {
            return res.status(400).json({ message: 'Driver tracking is not active' });
        }

        const newLocation = new Location({
            driver: req.driver._id,
            latitude,
            longitude,
        });
        await newLocation.save();
        res.json({ message: 'Location updated', location: newLocation });
    } catch (error) {
        console.error('Error updating location:', error);
        res.status(500).json({ message: 'Failed to update location' });
    }
});

// Get Route Details for Driver
app.get('/api/driver/route', authenticateDriver, async (req, res) => {
    try {
        if (!req.driver.route) {
            return res.status(404).json({ message: 'Driver is not assigned to a route' });
        }
        const route = await Route.findById(req.driver.route);
        res.json(route);
    } catch (error) {
        console.error("Error getting driver's route", error);
        res.status(500).json({ message: "Failed to get driver's route" });
    }
});

// Get Latest Location for a Driver (for user view) - remains in server.js as it is used by users, not drivers.
app.get('/api/user/driver/:driverId/latest-location', async (req, res) => {
    const { driverId } = req.params;
    try {
        const latestLocation = await Location.findOne({ driver: driverId })
            .sort({ timestamp: -1 })
            .limit(1)
            .populate({
                path: 'driver',
                select: 'busNumber route', // Select only busNumber and route from driver
                populate: {
                    path: 'route', // Populate the route field of the driver
                    model: 'Route'
                }
            });

        if (latestLocation) {
            res.json(latestLocation);
        } else {
            res.status(404).json({ message: 'Location not found for this driver' });
        }
    } catch (error) {
        console.error('Error fetching latest location:', error);
        res.status(500).json({ message: 'Failed to fetch latest location' });
    }
});


// Start Server
const port = 5001;
app.listen(port, () => console.log(`Server running on port ${port}`));
