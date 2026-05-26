const express = require("express");
const cors = require("cors");
const path = require("path");
const mongoose = require("mongoose");
const dns = require('dns');

dns.setDefaultResultOrder('ipv4first');

const app = express();

app.use(cors());
app.use(express.json());

// SERVIR FRONTEND
app.use(express.static(path.join(__dirname)));

// 🔥 CONEXIÓN A MONGODB
mongoose.connect(process.env.MONGO_URL)
.then(() => console.log("✅ Conectado a MongoDB"))
.catch(err => console.log("❌ Error:", err));
// =====================
// 📦 MODELOS
// =====================

// USUARIOS
const UsuarioSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: String,
    rol: { type: String, default: "cliente" }
});
const Usuario = mongoose.model("Usuario", UsuarioSchema);


// TURNO (con horario)
const TurnoSchema = new mongoose.Schema({
    cliente: String,
    barbero: String,
    servicio: String,
    duracion: Number,           // minutos
    fechaInicio: Date,          // fecha y hora de inicio
    fechaFin: Date,             // calculada automáticamente
    estado: { type: String, default: "pendiente" },
    fecha: { type: Date, default: Date.now }
});
const Turno = mongoose.model("Turno", TurnoSchema);


// SERVICIO
const ServicioSchema = new mongoose.Schema({
    nombre: String,
    precio: Number,
    duracion: Number // minutos
});
const Servicio = mongoose.model("Servicio", ServicioSchema);


// =====================
// 🔐 AUTH ENDPOINTS
// =====================

app.post("/registro", async (req, res) => {
    try {
        const { username, password, rol } = req.body;
        const nuevo = new Usuario({ username, password, rol: rol || "cliente" });
        await nuevo.save();
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: "Usuario ya existe" });
    }
});

app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    const user = await Usuario.findOne({ username, password });
    if (!user) return res.status(401).json({ error: "Credenciales incorrectas" });
    res.json({ ok: true, username, rol: user.rol });
});

app.get("/barberos", async (req, res) => {
    const barberos = await Usuario.find({ rol: "barbero" }, "username");
    res.json(barberos);
});


// =====================
// ✂️ TURNO ENDPOINTS
// =====================

// CREAR TURNO con validación de horario
app.post("/turno", async (req, res) => {
    try {
        const { cliente, barbero, servicio, duracion, fechaInicio } = req.body;

        const inicio = new Date(fechaInicio);
        const fin = new Date(inicio.getTime() + duracion * 60000);

        // Validar horario: 8am - 6pm, lunes a sábado
        const hora = inicio.getHours();
        const diaSemana = inicio.getDay(); // 0=domingo, 6=sábado

        if (diaSemana === 0) {
            return res.status(400).json({ error: "La barbería no abre los domingos." });
        }
        if (hora < 8 || hora >= 18) {
            return res.status(400).json({ error: "El horario de atención es de 8am a 6pm." });
        }
        if (fin.getHours() >= 18 && fin.getMinutes() > 0) {
            return res.status(400).json({ error: "El turno terminaría después de las 6pm." });
        }

        // Validar que el barbero no tenga turno en ese horario
        const conflicto = await Turno.findOne({
            barbero,
            estado: { $nin: ["cancelado"] },
            $or: [
                { fechaInicio: { $lt: fin }, fechaFin: { $gt: inicio } }
            ]
        });

        if (conflicto) {
            return res.status(400).json({
                error: `El barbero ya tiene un turno de ${new Date(conflicto.fechaInicio).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })} a ${new Date(conflicto.fechaFin).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}.`
            });
        }

        const turno = new Turno({ cliente, barbero, servicio, duracion, fechaInicio: inicio, fechaFin: fin });
        await turno.save();
        res.json(turno);

    } catch (error) {
        res.status(500).json({ error: "Error al crear turno" });
    }
});

// VER TODOS LOS TURNOS
app.get("/turnos", async (req, res) => {
    const turnos = await Turno.find().sort({ fechaInicio: 1 });
    res.json(turnos);
});

// VER TURNOS DE UN CLIENTE
app.get("/turnos/:cliente", async (req, res) => {
    const turnos = await Turno.find({ cliente: req.params.cliente }).sort({ fechaInicio: 1 });
    res.json(turnos);
});

// ACTUALIZAR ESTADO
app.post("/turno/estado", async (req, res) => {
    try {
        const { id, estado } = req.body;

        if (estado === "completado") {
            await Turno.findByIdAndDelete(id);
            return res.json({ ok: true, eliminado: true });
        }

        const turno = await Turno.findByIdAndUpdate(id, { estado }, { new: true });
        res.json(turno);
    } catch (error) {
        res.status(500).json({ error: "Error al actualizar turno" });
    }
});


// =====================
// 💈 SERVICIO ENDPOINTS
// =====================

app.post("/servicio", async (req, res) => {
    try {
        const { nombre, precio, duracion } = req.body;
        const servicio = new Servicio({ nombre, precio, duracion });
        await servicio.save();
        res.json(servicio);
    } catch (error) {
        res.status(500).json({ error: "Error al crear servicio" });
    }
});

app.get("/servicios", async (req, res) => {
    const servicios = await Servicio.find();
    res.json(servicios);
});


// =====================
// 🔥 DESPIDOS ENDPOINT
// =====================

app.post("/despedir/:username", async (req, res) => {
    try {
        const { username } = req.params;
        await Usuario.findOneAndDelete({ username, rol: "barbero" });
        await Turno.deleteMany({ barbero: username });
        res.json({ ok: true, mensaje: `${username} ha sido despedido.` });
    } catch (error) {
        res.status(500).json({ error: "Error al despedir barbero" });
    }
});


// =====================
// 🚀 SERVIDOR
// =====================
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log("✅ Servidor de Barbería corriendo en puerto " + port);
});