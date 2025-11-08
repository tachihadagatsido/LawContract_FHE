import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface LegalContract {
  id: string;
  name: string;
  encryptedValue: string;
  publicValue1: number;
  publicValue2: number;
  description: string;
  creator: string;
  timestamp: number;
  isVerified: boolean;
  decryptedValue: number;
  category: string;
  status: string;
}

interface ContractStats {
  totalContracts: number;
  verifiedContracts: number;
  activeContracts: number;
  avgValue: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<LegalContract[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingContract, setCreatingContract] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newContractData, setNewContractData] = useState({ 
    name: "", 
    value: "", 
    description: "",
    category: "法律",
    status: "active"
  });
  const [selectedContract, setSelectedContract] = useState<LegalContract | null>(null);
  const [decryptedData, setDecryptedData] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [showFAQ, setShowFAQ] = useState(false);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        console.error('FHEVM initialization failed:', error);
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM初始化失败" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadContracts();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('数据加载失败:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadContracts = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const contractsList: LegalContract[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          contractsList.push({
            id: businessId,
            name: businessData.name,
            encryptedValue: businessId,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            description: businessData.description,
            creator: businessData.creator,
            timestamp: Number(businessData.timestamp),
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0,
            category: "法律",
            status: "active"
          });
        } catch (e) {
          console.error('合同数据加载错误:', e);
        }
      }
      
      setContracts(contractsList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "数据加载失败" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createContract = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "请先连接钱包" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingContract(true);
    setTransactionStatus({ visible: true, status: "pending", message: "使用Zama FHE创建加密合同..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("合约连接失败");
      
      const contractValue = parseInt(newContractData.value) || 0;
      const businessId = `contract-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, contractValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newContractData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        contractValue,
        0,
        newContractData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "等待交易确认..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "合同创建成功!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadContracts();
      setShowCreateModal(false);
      setNewContractData({ name: "", value: "", description: "", category: "法律", status: "active" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "用户取消交易" 
        : "提交失败: " + (e.message || "未知错误");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingContract(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "请先连接钱包" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "数据已在链上验证" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "链上验证解密中..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadContracts();
      
      setTransactionStatus({ visible: true, status: "success", message: "数据解密验证成功!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "数据已在链上验证" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadContracts();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "解密失败: " + (e.message || "未知错误") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const callIsAvailable = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const result = await contract.isAvailable();
      setTransactionStatus({ visible: true, status: "success", message: "合约可用性检查成功!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "可用性检查失败" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const getContractStats = (): ContractStats => {
    const totalContracts = contracts.length;
    const verifiedContracts = contracts.filter(c => c.isVerified).length;
    const activeContracts = contracts.filter(c => c.status === "active").length;
    const avgValue = contracts.length > 0 
      ? contracts.reduce((sum, c) => sum + c.publicValue1, 0) / contracts.length 
      : 0;

    return { totalContracts, verifiedContracts, activeContracts, avgValue };
  };

  const filteredContracts = contracts.filter(contract => {
    const matchesSearch = contract.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         contract.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = activeTab === "all" || 
                      (activeTab === "verified" && contract.isVerified) ||
                      (activeTab === "active" && contract.status === "active");
    return matchesSearch && matchesTab;
  });

  const stats = getContractStats();

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>🔐 FHE法律合同</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">⚖️</div>
            <h2>连接钱包管理加密法律合同</h2>
            <p>使用全同态加密技术保护您的敏感法律合同条款</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>连接钱包初始化FHE系统</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>创建加密的法律合同</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>安全验证和解密合同数据</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>初始化FHE加密系统...</p>
        <p className="loading-note">请稍候片刻</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>加载加密合同系统...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-section">
          <h1>⚖️ FHE法律合同平台</h1>
          <p>全同态加密保护的法律合同管理系统</p>
        </div>
        
        <div className="header-actions">
          <button className="faq-btn" onClick={() => setShowFAQ(true)}>常见问题</button>
          <button className="create-btn" onClick={() => setShowCreateModal(true)}>+ 新建合同</button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="stats-panel">
          <div className="stat-card">
            <div className="stat-icon">📄</div>
            <div className="stat-info">
              <div className="stat-value">{stats.totalContracts}</div>
              <div className="stat-label">总合同数</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">✅</div>
            <div className="stat-info">
              <div className="stat-value">{stats.verifiedContracts}</div>
              <div className="stat-label">已验证合同</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">⚡</div>
            <div className="stat-info">
              <div className="stat-value">{stats.activeContracts}</div>
              <div className="stat-label">活跃合同</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">💰</div>
            <div className="stat-info">
              <div className="stat-value">{stats.avgValue.toFixed(1)}</div>
              <div className="stat-label">平均价值</div>
            </div>
          </div>
        </div>

        <div className="controls-panel">
          <div className="search-box">
            <input 
              type="text" 
              placeholder="搜索合同名称或描述..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="tab-controls">
            <button className={`tab ${activeTab === "all" ? "active" : ""}`} onClick={() => setActiveTab("all")}>全部</button>
            <button className={`tab ${activeTab === "verified" ? "active" : ""}`} onClick={() => setActiveTab("verified")}>已验证</button>
            <button className={`tab ${activeTab === "active" ? "active" : ""}`} onClick={() => setActiveTab("active")}>活跃</button>
          </div>
          <div className="action-buttons">
            <button onClick={loadContracts} disabled={isRefreshing} className="refresh-btn">
              {isRefreshing ? "刷新中..." : "🔄"}
            </button>
            <button onClick={callIsAvailable} className="check-btn">检查合约</button>
          </div>
        </div>

        <div className="contracts-list">
          {filteredContracts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📝</div>
              <p>暂无合同数据</p>
              <button className="create-btn" onClick={() => setShowCreateModal(true)}>创建第一个合同</button>
            </div>
          ) : (
            filteredContracts.map((contract, index) => (
              <div 
                className={`contract-item ${selectedContract?.id === contract.id ? "selected" : ""} ${contract.isVerified ? "verified" : ""}`}
                key={index}
                onClick={() => setSelectedContract(contract)}
              >
                <div className="contract-header">
                  <h3>{contract.name}</h3>
                  <span className={`status-badge ${contract.isVerified ? "verified" : "pending"}`}>
                    {contract.isVerified ? "✅ 已验证" : "🔒 待验证"}
                  </span>
                </div>
                <p className="contract-desc">{contract.description}</p>
                <div className="contract-meta">
                  <span>创建者: {contract.creator.substring(0, 6)}...{contract.creator.substring(38)}</span>
                  <span>日期: {new Date(contract.timestamp * 1000).toLocaleDateString()}</span>
                </div>
                {contract.isVerified && (
                  <div className="decrypted-value">
                    解密值: {contract.decryptedValue}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      
      {showCreateModal && (
        <CreateContractModal 
          onSubmit={createContract} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingContract} 
          contractData={newContractData} 
          setContractData={setNewContractData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedContract && (
        <ContractDetailModal 
          contract={selectedContract} 
          onClose={() => { 
            setSelectedContract(null); 
            setDecryptedData(null); 
          }} 
          decryptedData={decryptedData} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => decryptData(selectedContract.id)}
        />
      )}
      
      {showFAQ && (
        <FAQModal onClose={() => setShowFAQ(false)} />
      )}
      
      {transactionStatus.visible && (
        <div className={`transaction-toast ${transactionStatus.status}`}>
          <div className="toast-content">
            <span className="toast-icon">
              {transactionStatus.status === "pending" && "⏳"}
              {transactionStatus.status === "success" && "✅"}
              {transactionStatus.status === "error" && "❌"}
            </span>
            {transactionStatus.message}
          </div>
        </div>
      )}
    </div>
  );
};

const CreateContractModal: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  contractData: any;
  setContractData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, contractData, setContractData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'value') {
      const intValue = value.replace(/[^\d]/g, '');
      setContractData({ ...contractData, [name]: intValue });
    } else {
      setContractData({ ...contractData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>创建新合同</h2>
          <button onClick={onClose} className="close-btn">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>🔐 FHE加密保护</strong>
            <p>合同数值将使用Zama FHE进行加密（仅支持整数）</p>
          </div>
          
          <div className="form-group">
            <label>合同名称 *</label>
            <input 
              type="text" 
              name="name" 
              value={contractData.name} 
              onChange={handleChange} 
              placeholder="输入合同名称..." 
            />
          </div>
          
          <div className="form-group">
            <label>合同数值（整数） *</label>
            <input 
              type="number" 
              name="value" 
              value={contractData.value} 
              onChange={handleChange} 
              placeholder="输入合同数值..." 
              min="0"
            />
            <div className="input-hint">FHE加密整数</div>
          </div>
          
          <div className="form-group">
            <label>合同描述</label>
            <textarea 
              name="description" 
              value={contractData.description} 
              onChange={handleChange} 
              placeholder="输入合同描述..." 
              rows={3}
            />
          </div>
          
          <div className="form-group">
            <label>合同分类</label>
            <select name="category" value={contractData.category} onChange={handleChange}>
              <option value="法律">法律</option>
              <option value="商业">商业</option>
              <option value="技术">技术</option>
            </select>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">取消</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !contractData.name || !contractData.value} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "加密并创建中..." : "创建合同"}
          </button>
        </div>
      </div>
    </div>
  );
};

const ContractDetailModal: React.FC<{
  contract: LegalContract;
  onClose: () => void;
  decryptedData: number | null;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
}> = ({ contract, onClose, decryptedData, isDecrypting, decryptData }) => {
  const [localDecrypted, setLocalDecrypted] = useState<number | null>(decryptedData);

  const handleDecrypt = async () => {
    if (localDecrypted !== null) {
      setLocalDecrypted(null);
      return;
    }
    
    const decrypted = await decryptData();
    if (decrypted !== null) {
      setLocalDecrypted(decrypted);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content large">
        <div className="modal-header">
          <h2>合同详情</h2>
          <button onClick={onClose} className="close-btn">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="contract-info-grid">
            <div className="info-item">
              <label>合同名称:</label>
              <span>{contract.name}</span>
            </div>
            <div className="info-item">
              <label>创建者:</label>
              <span>{contract.creator}</span>
            </div>
            <div className="info-item">
              <label>创建时间:</label>
              <span>{new Date(contract.timestamp * 1000).toLocaleString()}</span>
            </div>
            <div className="info-item">
              <label>状态:</label>
              <span className={`status ${contract.isVerified ? "verified" : "pending"}`}>
                {contract.isVerified ? "✅ 已验证" : "🔒 待验证"}
              </span>
            </div>
          </div>
          
          <div className="description-section">
            <label>合同描述:</label>
            <p>{contract.description}</p>
          </div>
          
          <div className="encryption-section">
            <h3>🔐 加密数据管理</h3>
            <div className="data-row">
              <div className="data-label">加密数值:</div>
              <div className="data-value">
                {contract.isVerified ? 
                  `${contract.decryptedValue} (链上已验证)` : 
                  localDecrypted !== null ? 
                  `${localDecrypted} (本地解密)` : 
                  "🔒 FHE加密整数"
                }
              </div>
              <button 
                className={`decrypt-btn ${(contract.isVerified || localDecrypted !== null) ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? "验证中..." : 
                 contract.isVerified ? "✅ 已验证" : 
                 localDecrypted !== null ? "🔄 重新验证" : 
                 "🔓 验证解密"}
              </button>
            </div>
            
            <div className="fhe-process">
              <h4>FHE解密流程</h4>
              <div className="process-steps">
                <div className="step">1. 链上加密数据</div>
                <div className="step">2. 客户端离线解密</div>
                <div className="step">3. 提交验证证明</div>
                <div className="step">4. 链上验证签名</div>
              </div>
            </div>
          </div>
          
          {(contract.isVerified || localDecrypted !== null) && (
            <div className="analysis-section">
              <h3>📊 合同分析</h3>
              <div className="analysis-grid">
                <div className="analysis-item">
                  <label>当前数值</label>
                  <div className="analysis-value">
                    {contract.isVerified ? contract.decryptedValue : localDecrypted}
                  </div>
                </div>
                <div className="analysis-item">
                  <label>加密状态</label>
                  <div className="analysis-status verified">FHE保护</div>
                </div>
                <div className="analysis-item">
                  <label>验证方式</label>
                  <div className="analysis-method">
                    {contract.isVerified ? "链上验证" : "本地解密"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">关闭</button>
          {!contract.isVerified && (
            <button 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
              className="verify-btn"
            >
              {isDecrypting ? "链上验证中..." : "链上验证"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const FAQModal: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const faqs = [
    {
      question: "什么是FHE全同态加密？",
      answer: "全同态加密允许在加密数据上直接进行计算，无需解密即可处理敏感信息。"
    },
    {
      question: "合同数据如何加密？",
      answer: "合同数值在客户端使用Zama FHE加密后存储到区块链，只有授权用户才能解密。"
    },
    {
      question: "解密验证如何工作？",
      answer: "客户端离线解密后提交证明到智能合约，合约验证解密正确性而不暴露原始数据。"
    },
    {
      question: "支持哪些数据类型？",
      answer: "目前仅支持整数类型的数值加密，未来将支持更复杂的数据结构。"
    }
  ];

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>❓ 常见问题解答</h2>
          <button onClick={onClose} className="close-btn">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="faq-list">
            {faqs.map((faq, index) => (
              <div key={index} className="faq-item">
                <h4>{faq.question}</h4>
                <p>{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">关闭</button>
        </div>
      </div>
    </div>
  );
};

export default App;

