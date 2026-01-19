import { DynamicWidget, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { RhinestoneSDK } from "@rhinestone/sdk";
import { useState } from "react";
import { type Address, type Hex, type SignedAuthorizationList } from "viem";
import { toAccount } from "viem/accounts";
import { base } from "viem/chains";

const RHINESTONE_API_KEY = import.meta.env.VITE_RHINESTONE_API_KEY;

type LogEntry = { time: string; level: "info" | "error" | "success"; msg: string };

interface DynamicWaasConnector {
	setActiveAccount?: (address: string) => void;
	getSigner?: () => Promise<any>;
}

// Convert BigInts to strings for Dynamic signer compatibility
const convertBigIntsToString = (obj: any): any => {
	if (obj === null || obj === undefined) return obj;
	if (typeof obj === "bigint") return obj.toString();
	if (Array.isArray(obj)) return obj.map(convertBigIntsToString);
	if (typeof obj === "object") {
		const result: any = {};
		for (const key in obj) {
			result[key] = convertBigIntsToString(obj[key]);
		}
		return result;
	}
	return obj;
};

export default function RhinestoneTest() {
	const { primaryWallet } = useDynamicContext();
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [running, setRunning] = useState(false);

	const log = (level: LogEntry["level"], msg: string) => {
		const time = new Date().toLocaleTimeString();
		setLogs((prev) => [...prev, { time, level, msg }]);
		console.log(`[${level.toUpperCase()}] ${msg}`);
	};

	const runTest = async () => {
		setLogs([]);
		setRunning(true);

		try {
			if (!primaryWallet) {
				log("error", "No wallet connected");
				return;
			}
			const address = primaryWallet.address as Address;
			log("success", `Wallet: ${address}`);

			// Setup Dynamic WaaS connector
			const connector = primaryWallet.connector as DynamicWaasConnector;
			if (!connector?.setActiveAccount || !connector?.getSigner) {
				log("error", "Not a WaaS wallet");
				return;
			}
			connector.setActiveAccount(address);
			const dynamicSigner = await connector.getSigner();
			if (!dynamicSigner?.signAuthorization) {
				log("error", "Signer missing signAuthorization");
				return;
			}
			log("success", "Dynamic signer ready");

			// Create custom viem account
			const eoaAccount = toAccount({
				address,
				async signMessage({ message }) {
					return dynamicSigner.signMessage({ message });
				},
				async signTransaction(tx) {
					return dynamicSigner.signTransaction(tx);
				},
				async signTypedData(typedData) {
					return dynamicSigner.signTypedData({
						domain: convertBigIntsToString(typedData.domain),
						types: typedData.types,
						primaryType: typedData.primaryType,
						message: convertBigIntsToString(typedData.message),
					});
				},
				async signAuthorization(authorization) {
					const contractAddress = authorization.contractAddress || authorization.address;
					log("info", `Signing authorization for: ${contractAddress}`);
					return dynamicSigner.signAuthorization({
						contractAddress: contractAddress as Address,
						chainId: Number(authorization.chainId),
						nonce: authorization.nonce !== undefined ? Number(authorization.nonce) : undefined,
					});
				},
			});
			log("success", "Custom account created");

			// Initialize Rhinestone SDK
			if (!RHINESTONE_API_KEY) {
				log("error", "RHINESTONE_API_KEY not set");
				return;
			}
			const sdk = new RhinestoneSDK({ apiKey: RHINESTONE_API_KEY });

			// Create Rhinestone account
			const rhinestoneAccount = await sdk.createAccount({
				owners: { type: "ecdsa", accounts: [eoaAccount] },
				eoa: eoaAccount,
			});
			log("success", `Rhinestone account: ${rhinestoneAccount.getAddress()}`);

			// Sign EIP-7702 init data
			log("info", "Signing EIP-7702 init data...");
			let eip7702InitSignature: Hex | undefined;
			try {
				eip7702InitSignature = await rhinestoneAccount.signEip7702InitData();
				log("success", `Init signature: ${eip7702InitSignature?.slice(0, 20)}...`);
			} catch (e: any) {
				log("error", `signEip7702InitData failed: ${e.message}`);
			}

			// Prepare transaction
			log("info", "Preparing transaction...");
			const preparedTx = await rhinestoneAccount.prepareTransaction({
				chain: base,
				calls: [{ to: rhinestoneAccount.getAddress() as Address, value: 0n, data: "0x" as Hex }],
				feeAsset: "USDC" as const,
				eip7702InitSignature,
			});
			log("success", "Transaction prepared");

			// Sign transaction
			log("info", "Signing transaction...");
			const signedTx = await rhinestoneAccount.signTransaction(preparedTx);
			log("success", "Transaction signed");

			// Sign authorizations
			log("info", "Signing authorizations...");
			const authorizations: SignedAuthorizationList = await rhinestoneAccount.signAuthorizations(signedTx);
			log("success", `Authorizations signed: ${authorizations.length}`);

			// Submit transaction
			log("info", "Submitting transaction...");
			const result = await rhinestoneAccount.submitTransaction(signedTx, authorizations);
			log("success", "=== TRANSACTION SUBMITTED ===");
			log("info", `Result: ${JSON.stringify(result, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);

		} catch (e: any) {
			log("error", `Error: ${e.message}`);
			console.error(e);
		} finally {
			setRunning(false);
		}
	};

	return (
		<div style={{ fontFamily: "monospace", padding: 20, maxWidth: 800, margin: "0 auto" }}>
			<h1>Rhinestone + EIP-7702 Test</h1>

			<div style={{ marginBottom: 20 }}>
				<DynamicWidget />
			</div>

			{primaryWallet && (
				<div style={{ marginBottom: 20 }}>
					<p>Connected: {primaryWallet.address}</p>
					<button
						onClick={runTest}
						disabled={running}
						style={{ padding: "10px 20px", fontSize: 16, cursor: running ? "wait" : "pointer" }}
					>
						{running ? "Running..." : "Run Test"}
					</button>
				</div>
			)}

			<div style={{ background: "#1a1a1a", color: "#fff", padding: 15, borderRadius: 8, maxHeight: 400, overflow: "auto" }}>
				<h3 style={{ margin: "0 0 10px" }}>Logs:</h3>
				{logs.length === 0 && <p style={{ color: "#666" }}>Connect wallet and click "Run Test"</p>}
				{logs.map((l, i) => (
					<div key={i} style={{ color: l.level === "error" ? "#ff6b6b" : l.level === "success" ? "#69db7c" : "#fff", marginBottom: 4 }}>
						<span style={{ color: "#666" }}>[{l.time}]</span> {l.msg}
					</div>
				))}
			</div>
		</div>
	);
}
