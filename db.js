const { Sequelize } = require('sequelize');
require("dotenv").config();

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.HOST,
    dialect: 'mysql',
    logging: false,
});

async function connectDB() {
    try {
        await sequelize.authenticate();
        // console.log('Database connected successfully.');
        await sequelize.sync();
        console.log('All models synced successfully.');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
        throw error;
    }
}

module.exports = { sequelize, connectDB };