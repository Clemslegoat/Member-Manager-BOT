const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();

// Configuration du bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Variables de configuration
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN,
    UPDATE_INTERVAL: parseInt(process.env.UPDATE_INTERVAL) || 30000,
    STATS_CATEGORY_NAME: process.env.STATS_CATEGORY_NAME || '📈 Stats',
    ROLE_ID: process.env.ROLE_ID,
    CHANNELS: {
        MEMBERS: '🙋‍♂️┃membres : {count}'
    }
};

// Variables globales
let statsCategory = null;
let statsChannels = {};
let updateInterval = null;

// Événement de connexion du bot
client.once('ready', async () => {
    console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
    
    // Initialiser les statistiques pour chaque serveur
    for (const guild of client.guilds.cache.values()) {
        await initializeStatsForGuild(guild);
    }
    
    // Démarrer la mise à jour automatique
    startAutoUpdate();
});

// Événement quand le bot rejoint un nouveau serveur
client.on('guildCreate', async (guild) => {
    console.log(`📥 Ajouté au serveur: ${guild.name}`);
    await initializeStatsForGuild(guild);
});

// Événements pour mettre à jour les stats en temps réel
client.on('guildMemberAdd', async (member) => {
    // Ajouter le rôle automatiquement au nouvel arrivant
    if (CONFIG.ROLE_ID) {
        try {
            const role = member.guild.roles.cache.get(CONFIG.ROLE_ID);
            if (role) {
                await member.roles.add(role);
                console.log(`✅ Rôle attribué à ${member.user.tag}`);
            } else {
                console.log(`❌ Rôle avec l'ID ${CONFIG.ROLE_ID} introuvable sur ${member.guild.name}`);
            }
        } catch (error) {
            console.error(`❌ Erreur lors de l'attribution du rôle à ${member.user.tag}:`, error);
        }
    }
    updateStatsForGuild(member.guild);
});
client.on('guildMemberRemove', (member) => updateStatsForGuild(member.guild));

// Commandes slash
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'setup-stats') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ Vous devez être administrateur pour utiliser cette commande.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });
        
        try {
            await initializeStatsForGuild(interaction.guild);
            await interaction.editReply('✅ Les salons de statistiques ont été configurés avec succès !');
        } catch (error) {
            console.error('Erreur lors de la configuration:', error);
            await interaction.editReply('❌ Une erreur est survenue lors de la configuration.');
        }
    }

    if (commandName === 'remove-stats') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ Vous devez être administrateur pour utiliser cette commande.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });
        
        try {
            await removeStatsForGuild(interaction.guild);
            await interaction.editReply('✅ Les salons de statistiques ont été supprimés avec succès !');
        } catch (error) {
            console.error('Erreur lors de la suppression:', error);
            await interaction.editReply('❌ Une erreur est survenue lors de la suppression.');
        }
    }
});

// Fonction pour initialiser les statistiques d'un serveur
async function initializeStatsForGuild(guild) {
    try {
        console.log(`🔧 Configuration des stats pour: ${guild.name}`);

        // Vérifier les permissions du bot
        const botMember = guild.members.cache.get(client.user.id);
        if (!botMember.permissions.has([
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect
        ])) {
            console.log(`❌ Permissions insuffisantes sur ${guild.name}`);
            return;
        }

        // Chercher la catégorie de statistiques existante
        let category = guild.channels.cache.find(
            channel => channel.type === ChannelType.GuildCategory && 
                      channel.name === CONFIG.STATS_CATEGORY_NAME
        );

        if (!category) {
            console.log(`❌ Catégorie "${CONFIG.STATS_CATEGORY_NAME}" non trouvée sur ${guild.name}`);
            return;
        }

        // Stocker la catégorie pour ce serveur
        if (!statsChannels[guild.id]) {
            statsChannels[guild.id] = {};
        }
        statsChannels[guild.id].category = category;

        // Créer ou mettre à jour tous les salons de stats
        const channelPromises = Object.entries(CONFIG.CHANNELS).map(async ([key, template]) => {
            const stats = await getGuildStats(guild);
            const channelName = formatChannelName(template, stats, key);
            
            // *** DÉBUT DE LA MODIFICATION ***
            // Définir la base du nom pour la recherche (la partie avant le compteur)
            const baseChannelName = template.split('{count}')[0];

            // Chercher un salon existant en se basant sur le début de son nom
            let channel = guild.channels.cache.find(
                ch => ch.parentId === category.id && 
                      ch.type === ChannelType.GuildVoice &&
                      ch.name.startsWith(baseChannelName)
            );
            // *** FIN DE LA MODIFICATION ***

            if (!channel) {
                // Si AUCUN salon n'est trouvé, on le crée
                console.log(`Création du salon de stats "${baseChannelName}" sur ${guild.name}`);
                channel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildVoice,
                    parent: category.id,
                    permissionOverwrites: [
                        {
                            id: guild.roles.everyone.id,
                            deny: [PermissionFlagsBits.Connect]
                        }
                    ]
                });
            } else {
                // Si le salon existe DÉJÀ, on met simplement son nom à jour
                await channel.setName(channelName);
            }

            statsChannels[guild.id][key] = channel;
        });

        await Promise.all(channelPromises);
        console.log(`✅ Stats configurées pour: ${guild.name}`);

    } catch (error) {
        console.error(`❌ Erreur lors de l'initialisation pour ${guild.name}:`, error);
    }
}

// Fonction pour supprimer les statistiques d'un serveur
async function removeStatsForGuild(guild) {
    try {
        const category = guild.channels.cache.find(
            channel => channel.type === ChannelType.GuildCategory && 
                      channel.name === CONFIG.STATS_CATEGORY_NAME
        );

        if (category) {
            // Supprimer seulement les salons de stats dans la catégorie (pas la catégorie elle-même)
            const channelsToDelete = guild.channels.cache.filter(
                channel => channel.parentId === category.id && 
                          channel.name.includes('Membres:')
            );

            for (const channel of channelsToDelete.values()) {
                await channel.delete();
            }
        }

        // Nettoyer le cache
        delete statsChannels[guild.id];
        
        console.log(`✅ Salons de stats supprimés pour: ${guild.name}`);
    } catch (error) {
        console.error(`❌ Erreur lors de la suppression pour ${guild.name}:`, error);
    }
}

// Fonction pour obtenir les statistiques d'un serveur
async function getGuildStats(guild) {
    try {
        // On s'assure d'avoir la liste à jour de tous les membres
        const members = await guild.members.fetch();
        
        // On filtre la liste pour ne garder que les membres qui ne sont PAS des bots
        const humanMembers = members.filter(member => !member.user.bot).size;

        return {
            MEMBERS: humanMembers
        };
    } catch (error) {
        console.error('Erreur lors de la récupération des stats:', error);
        return {
            MEMBERS: 0
        };
    }
}

// Fonction pour formater le nom du salon
function formatChannelName(template, stats, key) {
    return template.replace('{count}', stats[key] || 0);
}

// Fonction pour mettre à jour les statistiques d'un serveur
async function updateStatsForGuild(guild) {
    try {
        if (!statsChannels[guild.id]) return;

        const stats = await getGuildStats(guild);
        
        const updatePromises = Object.entries(CONFIG.CHANNELS).map(async ([key, template]) => {
            const channel = statsChannels[guild.id][key];
            if (!channel) return;

            const newName = formatChannelName(template, stats, key);
            if (channel.name !== newName) {
                await channel.setName(newName);
            }
        });

        await Promise.all(updatePromises);
    } catch (error) {
        console.error(`❌ Erreur mise à jour stats pour ${guild.name}:`, error);
    }
}

// Fonction pour démarrer la mise à jour automatique
function startAutoUpdate() {
    if (updateInterval) clearInterval(updateInterval);
    
    updateInterval = setInterval(async () => {
        console.log('🔄 Mise à jour automatique des statistiques...');
        
        const updatePromises = client.guilds.cache.map(guild => 
            updateStatsForGuild(guild)
        );
        
        await Promise.all(updatePromises);
    }, CONFIG.UPDATE_INTERVAL);
}

// Enregistrement des commandes slash
async function registerCommands() {
    const commands = [
        {
            name: 'setup-stats',
            description: 'Configure les salons de statistiques du serveur'
        },
        {
            name: 'remove-stats',
            description: 'Supprime les salons de statistiques du serveur'
        }
    ];

    try {
        console.log('🔄 Enregistrement des commandes slash...');
        await client.application.commands.set(commands);
        console.log('✅ Commandes slash enregistrées');
    } catch (error) {
        console.error('❌ Erreur lors de l\'enregistrement des commandes:', error);
    }
}

// Événement de connexion pour enregistrer les commandes
client.once('ready', () => {
    registerCommands();
});

// Gestion des erreurs
client.on('error', console.error);
process.on('unhandledRejection', console.error);

// Connexion du bot
client.login(CONFIG.TOKEN);