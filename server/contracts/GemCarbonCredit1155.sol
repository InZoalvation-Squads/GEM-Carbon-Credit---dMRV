// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title GEM Carbon Credit — ERC-1155 semi-fungible carbon credit batches.
/// Each batch (token id) is one issuance: id ↔ one anchored MRV credential,
/// supply = whole tCO2e. `retire` burns credits when they are claimed —
/// the registry step Verra performs by marking serials in its database.
contract GemCarbonCredit1155 {
    event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);
    event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values);
    event ApprovalForAll(address indexed account, address indexed operator, bool approved);
    event URI(string value, uint256 indexed id);
    event Retired(address indexed by, uint256 indexed id, uint256 amount);

    address public immutable minter;
    string private _uri;

    mapping(uint256 => mapping(address => uint256)) private _balances;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(uint256 => uint256) public totalSupply;
    mapping(uint256 => uint256) public retired;
    /// credential id (urn:vc:…) the batch certifies — on-chain provenance link.
    mapping(uint256 => string) public batchRef;

    constructor(string memory uri_) {
        minter = msg.sender;
        _uri = uri_;
    }

    function uri(uint256) external view returns (string memory) {
        return _uri;
    }

    function balanceOf(address account, uint256 id) public view returns (uint256) {
        return _balances[id][account];
    }

    function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids)
        external view returns (uint256[] memory out)
    {
        require(accounts.length == ids.length, "length mismatch");
        out = new uint256[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++) out[i] = _balances[ids[i]][accounts[i]];
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    /// One batch per id; amount in whole tCO2e; ref = credential id.
    function mintBatch(address to, uint256 id, uint256 amount, string calldata ref) external {
        require(msg.sender == minter, "not minter");
        require(amount > 0, "zero amount");
        require(totalSupply[id] == 0, "batch exists");
        totalSupply[id] = amount;
        _balances[id][to] += amount;
        batchRef[id] = ref;
        emit TransferSingle(msg.sender, address(0), to, id, amount);
        emit URI(_uri, id);
    }

    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata) external {
        require(from == msg.sender || isApprovedForAll[from][msg.sender], "not authorized");
        _transfer(from, to, id, amount);
        emit TransferSingle(msg.sender, from, to, id, amount);
    }

    function safeBatchTransferFrom(
        address from, address to, uint256[] calldata ids, uint256[] calldata amounts, bytes calldata
    ) external {
        require(from == msg.sender || isApprovedForAll[from][msg.sender], "not authorized");
        require(ids.length == amounts.length, "length mismatch");
        for (uint256 i = 0; i < ids.length; i++) _transfer(from, to, ids[i], amounts[i]);
        emit TransferBatch(msg.sender, from, to, ids, amounts);
    }

    /// Burn credits when they are claimed against emissions (Verra "retire").
    function retire_(uint256 id, uint256 amount) external {
        uint256 bal = _balances[id][msg.sender];
        require(bal >= amount && amount > 0, "insufficient");
        unchecked {
            _balances[id][msg.sender] = bal - amount;
            totalSupply[id] -= amount;
        }
        retired[id] += amount;
        emit TransferSingle(msg.sender, msg.sender, address(0), id, amount);
        emit Retired(msg.sender, id, amount);
    }

    function _transfer(address from, address to, uint256 id, uint256 amount) private {
        require(to != address(0), "zero to");
        uint256 fromBal = _balances[id][from];
        require(fromBal >= amount, "insufficient");
        unchecked { _balances[id][from] = fromBal - amount; }
        _balances[id][to] += amount;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0xd9b67a26 || interfaceId == 0x01ffc9a7; // ERC1155 / ERC165
    }
}
