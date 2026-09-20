import React from "react";
import ReactDOM from "react-dom/client";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { NightlyWalletAdapter } from "@solana/wallet-adapter-nightly";
import { clusterApiUrl } from "@solana/web3.js";
import App from "./App";
import "./styles.css";
import "@solana/wallet-adapter-react-ui/styles.css";

// The app talks to Cookie Chain (SVM). wallet-adapter only lets us pick a
// "cluster" for its default connection bookkeeping — we override the actual
// endpoint with our own ConnectionProvider below.
const COOKIE = { url: "https://rpc.cookiescan.io" };

const wallets = [new NightlyWalletAdapter()];

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConnectionProvider endpoint={COOKIE.url}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </React.StrictMode>,
);
