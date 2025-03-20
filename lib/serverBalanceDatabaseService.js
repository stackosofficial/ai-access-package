"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const admin = __importStar(require("firebase-admin"));
class ServerBalanceDatabaseService {
    constructor(envConfig) {
        this.db = null;
        this.setup = async () => {
            await this.setupDatabase();
        };
        this.setExtractBalance = async (accountNFT, price) => {
            try {
                // Create a new entry in the history collection with timestamp
                const historyDocRef = this.getHistoryCollectionRef().doc();
                const timestamp = admin.firestore.FieldValue.serverTimestamp();
                await historyDocRef.set({
                    collection_id: accountNFT.collectionID,
                    nft_id: accountNFT.nftID,
                    costs: price,
                    applied: false,
                    created_at: timestamp,
                    updated_at: timestamp,
                });
                // Also update the current balance in the main collection
                const docRef = this.getCollectionRef().doc(this.getNFTId(accountNFT));
                await docRef.set({
                    collection_id: accountNFT.collectionID,
                    nft_id: accountNFT.nftID,
                    costs: price,
                    updated_at: timestamp,
                    created_at: timestamp,
                }, { merge: true });
                return { success: true, data: 1 };
            }
            catch (error) {
                console.error("Error in setExtractBalance:", error);
                return { success: false, data: error };
            }
        };
        this.getExtractBalance = async (accountNFT) => {
            try {
                // Use a simple query without ordering to avoid index requirements
                const snapshot = await this.getCollectionRef()
                    .where("collection_id", "==", accountNFT.collectionID)
                    .where("nft_id", "==", accountNFT.nftID)
                    .get();
                if (snapshot.empty)
                    return { success: true, data: null };
                // Get the latest document based on created_at
                let latestDoc = snapshot.docs[0];
                let latestTimestamp = latestDoc.data().created_at;
                // Process in-memory to find the latest document
                for (let i = 1; i < snapshot.docs.length; i++) {
                    const doc = snapshot.docs[i];
                    const timestamp = doc.data().created_at;
                    if (timestamp && latestTimestamp && timestamp > latestTimestamp) {
                        latestDoc = doc;
                        latestTimestamp = timestamp;
                    }
                }
                const data = latestDoc.data();
                return {
                    success: true,
                    data: {
                        accountNFT: {
                            collectionID: data.collection_id,
                            nftID: data.nft_id,
                        },
                        costs: data.costs,
                    },
                };
            }
            catch (error) {
                console.error("Error in getExtractBalance:", error);
                return { success: false, data: error };
            }
        };
        this.deleteNFTExtract = async (accountNFTs) => {
            try {
                const batch = this.db.batch();
                for (const nft of accountNFTs) {
                    const docRef = this.getCollectionRef().doc(this.getNFTId(nft));
                    batch.delete(docRef);
                }
                await batch.commit();
                return { success: true, data: accountNFTs.length };
            }
            catch (error) {
                return { success: false, data: error };
            }
        };
        this.setupDatabase = async () => {
            const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = this.envConfig.env;
            if (!FIREBASE_PROJECT_ID ||
                !FIREBASE_CLIENT_EMAIL ||
                !FIREBASE_PRIVATE_KEY) {
                throw new Error("Firebase credentials not configured");
            }
            try {
                // Check if Firebase is already initialized
                if (admin.apps.length === 0) {
                    admin.initializeApp({
                        credential: admin.credential.cert({
                            projectId: FIREBASE_PROJECT_ID,
                            clientEmail: FIREBASE_CLIENT_EMAIL,
                            privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
                        }),
                        // Add SSL configuration
                        databaseURL: `https://${FIREBASE_PROJECT_ID}.firebaseio.com`,
                    });
                }
                this.db = admin.firestore();
                // Configure Firestore settings
                this.db.settings({
                    ignoreUndefinedProperties: true,
                    ssl: true,
                });
                // Create required indexes, if they don't exist
                await this.createRequiredIndexes();
                console.log("Connected to Firebase Firestore");
            }
            catch (error) {
                console.error("Error initializing Firebase:", error);
                throw new Error(`Failed to initialize Firebase: ${error.message}`);
            }
        };
        this.update = async () => { };
        this.getClient = async () => {
            if (!this.db)
                throw new Error("Database not initialized");
            return this.db;
        };
        this.getUnappliedCosts = async () => {
            try {
                // Use a simpler query to avoid index requirements
                const snapshot = await this.getHistoryCollectionRef()
                    .where("applied", "==", false)
                    .get();
                const costs = [];
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    costs.push({
                        accountNFT: {
                            collectionID: data.collection_id,
                            nftID: data.nft_id,
                        },
                        costs: data.costs,
                        docId: doc.id,
                        timestamp: data.created_at,
                    });
                });
                // Sort in memory by timestamp if needed
                costs.sort((a, b) => {
                    if (!a.timestamp || !b.timestamp)
                        return 0;
                    // Sort in descending order (newest first)
                    return b.timestamp.toDate().getTime() - a.timestamp.toDate().getTime();
                });
                return { success: true, data: costs };
            }
            catch (error) {
                console.error("Error in getUnappliedCosts:", error);
                return { success: false, data: error };
            }
        };
        this.markCostsAsApplied = async (docIds) => {
            try {
                if (docIds.length === 0) {
                    return { success: true, data: 0 };
                }
                // Use batches to update documents efficiently
                const batchSize = 500; // Firestore maximum batch size
                const batches = [];
                for (let i = 0; i < docIds.length; i += batchSize) {
                    const batch = this.db.batch();
                    const chunk = docIds.slice(i, i + batchSize);
                    for (const docId of chunk) {
                        const docRef = this.getHistoryCollectionRef().doc(docId);
                        batch.update(docRef, {
                            applied: true,
                            updated_at: admin.firestore.FieldValue.serverTimestamp(),
                        });
                    }
                    batches.push(batch.commit());
                }
                await Promise.all(batches);
                console.log(`Marked ${docIds.length} costs as applied`);
                return { success: true, data: docIds.length };
            }
            catch (error) {
                console.error("Error in markCostsAsApplied:", error);
                return { success: false, data: error };
            }
        };
        this.envConfig = envConfig;
    }
    getCollectionRef() {
        if (!this.db)
            throw new Error("Database not initialized");
        return this.db.collection("nft_extract_costs_" + this.envConfig.env.SUBNET_ID);
    }
    getHistoryCollectionRef() {
        if (!this.db)
            throw new Error("Database not initialized");
        return this.db.collection("nft_extract_costs_history_" + this.envConfig.env.SUBNET_ID);
    }
    async runTransaction(operation) {
        if (!this.db)
            throw new Error("Database not initialized");
        return this.db.runTransaction(operation);
    }
    getNFTId(accountNFT) {
        return `${accountNFT.collectionID}_${accountNFT.nftID}`;
    }
    async *getNFTExtractCursor() {
        const snapshot = await this.getCollectionRef()
            .where("costs", ">", "0")
            .get();
        for (const doc of snapshot.docs) {
            const data = doc.data();
            yield {
                accountNFT: {
                    collectionID: data.collection_id,
                    nftID: data.nft_id,
                },
                costs: data.costs,
            };
        }
    }
    async createRequiredIndexes() {
        try {
            // We can't directly create indexes programmatically in client SDKs
            // Instead, log instructions about required indexes
            console.log("Required indexes for Firestore queries:");
            console.log("1. Collection: nft_extract_costs_[SUBNET_ID]");
            console.log("   Fields: collection_id (ASC), nft_id (ASC), created_at (DESC)");
            console.log("2. Collection: nft_extract_costs_history_[SUBNET_ID]");
            console.log("   Fields: applied (ASC), created_at (DESC)");
            // Alternative approach: Attempt to make a test query to trigger index creation
            // This will fail the first time but output the index creation link
            const collectionName = "nft_extract_costs_" + this.envConfig.env.SUBNET_ID;
            console.log(`Testing query for collection: ${collectionName}`);
            try {
                // This is expected to fail if the index doesn't exist
                await this.db.collection(collectionName)
                    .where("collection_id", "==", "test")
                    .where("nft_id", "==", "test")
                    .orderBy("created_at", "desc")
                    .limit(1)
                    .get();
            }
            catch (e) {
                if (e.code === 9 &&
                    e.details &&
                    e.details.includes("requires an index")) {
                    console.log("Index required. Creation link:");
                    console.log(e.details);
                    // Don't throw, this is expected
                }
                else {
                    // Unexpected error, log but don't throw
                    console.error("Unexpected error during index testing:", e);
                }
            }
            // Try the second collection too
            const historyCollectionName = "nft_extract_costs_history_" + this.envConfig.env.SUBNET_ID;
            console.log(`Testing query for collection: ${historyCollectionName}`);
            try {
                await this.db.collection(historyCollectionName)
                    .where("applied", "==", false)
                    .orderBy("created_at", "desc")
                    .limit(1)
                    .get();
            }
            catch (e) {
                if (e.code === 9 &&
                    e.details &&
                    e.details.includes("requires an index")) {
                    console.log("Index required. Creation link:");
                    console.log(e.details);
                    // Don't throw, this is expected
                }
                else {
                    // Unexpected error, log but don't throw
                    console.error("Unexpected error during index testing:", e);
                }
            }
        }
        catch (error) {
            console.error("Error creating indexes:", error);
            // Don't fail setup because of index creation issues
        }
    }
}
exports.default = ServerBalanceDatabaseService;
