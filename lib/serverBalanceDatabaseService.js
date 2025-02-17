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
                const docRef = this.getCollectionRef().doc(this.getNFTId(accountNFT));
                await docRef.set({
                    collection_id: accountNFT.collectionID,
                    nft_id: accountNFT.nftID,
                    costs: price,
                    updated_at: admin.firestore.FieldValue.serverTimestamp(),
                    created_at: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                return { success: true, data: 1 };
            }
            catch (error) {
                return { success: false, data: error };
            }
        };
        this.getExtractBalance = async (accountNFT) => {
            try {
                const docRef = this.getCollectionRef().doc(this.getNFTId(accountNFT));
                const doc = await docRef.get();
                if (!doc.exists)
                    return { success: true, data: null };
                const data = doc.data();
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
        this.envConfig = envConfig;
    }
    getCollectionRef() {
        if (!this.db)
            throw new Error("Database not initialized");
        return this.db.collection("nft_extract_costs_" + this.envConfig.env.SUBNET_ID);
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
}
exports.default = ServerBalanceDatabaseService;
