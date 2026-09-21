import React from "react";
import ReactDOM from "react-dom/client";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { NightlyWalletAdapter } from "@solana/wallet-adapter-nightly";
import App from "./App";
import { NET } from "./lib/chain";
import "./styles.css";
import "@solana/wallet-adapter-react-ui/styles.css";

// The app talks to Cookie Chain (SVM) or Solana Devnet, per the network
// selection in lib/chain.js (localStorage `cc_net`, switchable in the header).
const wallets = [new NightlyWalletAdapter()];

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConnectionProvider endpoint={NET.rpc}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </React.StrictMode>,
);
