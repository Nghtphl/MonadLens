// SPDX-License-Identifier: MIT
// MonadLens measurement-only port (CLAUDE.md §17), see docs/validation.md ("Hâlâ açık").
// Source:  https://github.com/Uniswap/liquidity-staker/blob/3edce550aeeb7b0c17a10701ff4484d6967e345f/contracts/StakingRewards.sol
// Ref:     derived from fixtures/realworld/StakingRewards.sol (Uniswap's fork of Synthetix StakingRewards)
// License: MIT (Synthetix StakingRewards; notice below)
// Note:    Only the reward bookkeeping (lastTimeRewardApplicable, rewardPerToken, earned, updateReward) and a
//          token-less stake(), rewritten for solc 0.8 (checked arithmetic instead of SafeMath) so it can be measured.
//
// Original license of Synthetix StakingRewards (text from the npm package synthetix@2.21.0):
//
// MIT License
//
// Copyright (c) 2019 Synthetix
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
pragma solidity ^0.8.20;
contract StakingRewardsCore {
    uint256 public periodFinish;
    uint256 public rewardRate = 1e18;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    uint256 private _totalSupply;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;
    mapping(address => uint256) private _balances;

    constructor() { periodFinish = block.timestamp + 7 days; lastUpdateTime = block.timestamp - 1; }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }
    function rewardPerToken() public view returns (uint256) {
        if (_totalSupply == 0) return rewardPerTokenStored;
        return rewardPerTokenStored + (lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * 1e18 / _totalSupply;
    }
    function earned(address account) public view returns (uint256) {
        return _balances[account] * (rewardPerToken() - userRewardPerTokenPaid[account]) / 1e18 + rewards[account];
    }
    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }
    function stake(uint256 amount) external updateReward(msg.sender) {
        _totalSupply += amount;
        _balances[msg.sender] += amount;
    }
}