const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../db');
const Surah = require('./Surah');
const Reciter = require('./Reciter');

class ReciterSurahLink extends Model { }

ReciterSurahLink.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    audio_url: { type: DataTypes.STRING, allowNull: false }
}, {
    sequelize,
    modelName: 'ReciterSurahLink',
    tableName: 'reciter_surah_links',
    timestamps: false
});

Reciter.belongsToMany(Surah, { through: ReciterSurahLink, foreignKey: 'reciter_id' });
Surah.belongsToMany(Reciter, { through: ReciterSurahLink, foreignKey: 'surah_id' });

ReciterSurahLink.belongsTo(Reciter, { foreignKey: 'reciter_id', as: 'reciter' });
ReciterSurahLink.belongsTo(Surah, { foreignKey: 'surah_id', as: 'surah' });
Reciter.hasMany(ReciterSurahLink, { foreignKey: 'reciter_id' });
Surah.hasMany(ReciterSurahLink, { foreignKey: 'surah_id' });

module.exports = ReciterSurahLink;