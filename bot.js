import express from 'express';
const app = express();

// Creamos un servidor web falso en el puerto que nos dé la nube
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('🤖 Bot de Trading Activo y Vigilando...'));
app.listen(PORT, () => console.log(`🌐 Servidor web de camuflaje corriendo en el puerto ${PORT}`));

import ccxt from 'ccxt';
import 'dotenv/config';
import fs from 'fs'; 

async function enviarTelegram(mensaje) {
    const token = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return; 
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: `🤖 Bot: ${mensaje}` })
        });
    } catch (error) {}
}

async function guardarLog(mensaje) {
    const fecha = new Date().toLocaleString();
    const texto = `[${fecha}] ${mensaje}`;
    console.log(texto); 
    fs.appendFileSync('historial.txt', texto + '\n'); 
    await enviarTelegram(mensaje); 
}

const exchange = new ccxt.binance({
    apiKey: process.env.API_KEY,
    secret: process.env.API_SECRET,
    enableRateLimit: true,
    proxy: process.env.PROXY_URL,
    timeout: 30000, 
});

exchange.setSandboxMode(true); 

const SYMBOL = 'PEPE/USDT';
const INVERSION_USDT = 15; 
const TIEMPO_ESPERA = 10000; // Lo bajamos a 10 segundos para vigilar el precio más de cerca

// --- 🧠 MEMORIA DEL TRAILING STOP ---
let estadoBot = 'BUSCANDO_COMPRA'; // Puede ser 'BUSCANDO_COMPRA' o 'VIGILANDO_VENTA'
let precioCompra = 0;
let precioMasAlto = 0;
let cantidadComprada = 0;

// Configuración de la estrategia
const UMBRAL_COMPRA = 0.01; // Queremos que caiga 1% para comprar
const DISTANCIA_TRAILING = 0.015; // Vende si el precio cae 1.5% desde el pico más alto

async function ejecutarLogicaGrid() {
    try {
        const ticker = await exchange.fetchTicker(SYMBOL);
        const precioActual = ticker.last;

        if (estadoBot === 'BUSCANDO_COMPRA') {
            console.log(`👀 Buscando entrada. Precio actual: $${precioActual.toFixed(8)}`);
            
            // Aquí puedes poner tu lógica de cuándo comprar. Por simplicidad, compraremos de una vez si hay saldo.
            const balance = await exchange.fetchBalance();
            const saldoUSDT = balance.USDT?.free || 0; 
            
            if (saldoUSDT >= INVERSION_USDT) {
                cantidadComprada = Math.round(INVERSION_USDT / precioActual);
                
                await guardarLog(`🛒 Ejecutando COMPRA de ${cantidadComprada} PEPE a $${precioActual.toFixed(8)}`);
                // Compramos a Market (Mercado) para tener las monedas ya
                await exchange.createMarketBuyOrder(SYMBOL, cantidadComprada);
                
                estadoBot = 'VIGILANDO_VENTA';
                precioCompra = precioActual;
                precioMasAlto = precioActual; // El pico inicial es el precio de compra
                await guardarLog(`✅ Compra lista. Activando Trailing Stop Loss... 🚀`);
            } else {
                console.log(`⚠️ Saldo insuficiente para comprar.`);
            }
        } 
        
        else if (estadoBot === 'VIGILANDO_VENTA') {
            // Si el precio sube, actualizamos nuestro récord
            if (precioActual > precioMasAlto) {
                precioMasAlto = precioActual;
                console.log(`🔥 ¡NUEVO PICO ALCANZADO! PEPE subió a $${precioMasAlto.toFixed(8)}`);
            }
            
            // Calculamos cuál es nuestro límite de venta (El precio más alto menos el porcentaje de trailing)
            const precioDisparoVenta = precioMasAlto * (1 - DISTANCIA_TRAILING);
            
            console.log(`📈 Actual: $${precioActual.toFixed(8)} | 🏔️ Pico: $${precioMasAlto.toFixed(8)} | 🛑 Vende si baja a: $${precioDisparoVenta.toFixed(8)}`);

            // Si el precio cae por debajo de nuestro límite dinámico... ¡VENDEMOS!
            if (precioActual <= precioDisparoVenta) {
                // Validación para no vender en pérdida respecto a nuestra compra inicial (Opcional, pero segura)
                if (precioActual > precioCompra) {
                    await guardarLog(`📉 El precio retrocedió. ¡Ejecutando VENTA para asegurar ganancias! a $${precioActual.toFixed(8)}`);
                    await exchange.createMarketSellOrder(SYMBOL, cantidadComprada);
                    
                    // Calculamos ganancia
                    const ganancia = (precioActual - precioCompra) * cantidadComprada;
                    await guardarLog(`🤑 Operación cerrada. Ganancia aprox: +$${ganancia.toFixed(2)} USDT`);
                    
                    // Reseteamos el bot para volver a comprar
                    estadoBot = 'BUSCANDO_COMPRA';
                    precioMasAlto = 0;
                } else {
                    console.log(`⏳ El precio retrocedió, pero seguimos por debajo del precio de compra. Sosteniendo (Hold)...`);
                }
            }
        }

    } catch (error) {
        console.error(`❌ Error en la matriz: ${error.message}`);
    }
}

async function loopBot() {
    await ejecutarLogicaGrid();
    setTimeout(loopBot, TIEMPO_ESPERA); 
}

guardarLog("🚀 Sistema Trailing Stop Loss encendido. Conectado a Telegram.");
loopBot();
