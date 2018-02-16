pragma solidity ^0.4.18;

library Strings {
    
  struct slice {
      uint _len;
      uint _ptr;
  }

  /// @dev Adapted from memcpy() by @arachnid (Nick Johnson <arachnid@notdot.net>)
  ///  This method is licenced under the Apache License.
  ///  Ref: https://github.com/Arachnid/solidity-stringutils/blob/2f6ca9accb48ae14c66f1437ec50ed19a0616f78/strings.sol
  function _memcpy(uint _dest, uint _src, uint _len) private view {
      // Copy word-length chunks while possible
      for(; _len >= 32; _len -= 32) {
          assembly {
              mstore(_dest, mload(_src))
          }
          _dest += 32;
          _src += 32;
      }

      // Copy remaining bytes
      uint256 mask = 256 ** (32 - _len) - 1;
      assembly {
          let srcpart := and(mload(_src), not(mask))
          let destpart := and(mload(_dest), mask)
          mstore(_dest, or(destpart, srcpart))
      }
  }

  /// @dev Adapted from toString(slice) by @arachnid (Nick Johnson <arachnid@notdot.net>)
  ///  This method is licenced under the Apache License.
  ///  Ref: https://github.com/Arachnid/solidity-stringutils/blob/2f6ca9accb48ae14c66f1437ec50ed19a0616f78/strings.sol
  function _toString(bytes32[4] _rawBytes, uint256 _stringLength) private view returns (string) {
      var outputString = new string(_stringLength);
      uint256 outputPtr;
      uint256 bytesPtr;

      assembly {
          outputPtr := add(outputString, 32)
          bytesPtr := _rawBytes
      }

      _memcpy(outputPtr, bytesPtr, _stringLength);

      return outputString;
  }

  /*
   * @dev Returns a slice containing the entire string.
   * @param self The string to make a slice from.
   * @return A newly allocated slice containing the entire string.
   */
  function _toSlice(string self) internal returns (slice) {
    uint ptr;
    assembly {
      ptr := add(self, 0x20)
    }
    return slice(bytes(self).length, ptr);
  }

  /*
   * @dev Returns a positive number if `other` comes lexicographically after
   *      `self`, a negative number if it comes before, or zero if the
   *      contents of the two slices are equal. Comparison is done per-rune,
   *      on unicode codepoints.
   * @param self The first slice to compare.
   * @param other The second slice to compare.
   * @return The result of the comparison.
   */
  function _compare(slice self, slice other) internal returns (int) {
    uint shortest = self._len;
    if (other._len < self._len)
      shortest = other._len;

    var selfptr = self._ptr;
    var otherptr = other._ptr;
    for (uint idx = 0; idx < shortest; idx += 32) {
      uint a;
      uint b;
      assembly {
        a := mload(selfptr)
        b := mload(otherptr)
      }
      if (a != b) {
        // Mask out irrelevant bytes and check again
        uint mask = ~(2 ** (8 * (32 - shortest + idx)) - 1);
        var diff = (a & mask) - (b & mask);
        if (diff != 0)
          return int(diff);
      }
      selfptr += 32;
      otherptr += 32;
    }
    return int(self._len) - int(other._len);
  }

}

contract SmazCompress {
  
  /* Our compression codebook, used for compression */
  string[] SMAZ_CB = ["ts", "ss", "d"];

  /* Reverse compression codebook, used for decompression */
  string[] SMAZ_RCB = ["0", "1", "2"];

  function compress(bytes32[] inArr) public returns (bytes32[] outArr) {

//     uint h1 = 0;
//     uint h2 = 0;
//     uint h3 = 0;
    
//     int verblen = 0;

//     int inlen = inArr.length;
//     int outlen = inlen;

//     bytes32[][256] storage verb;

//     uint outIdx = 0;
//     uint inIdx = 0;

//     while (inlen) {

//       int needed;
//       int j = 7;

//       bytes32 flush;
//       bytes32 slot;

//       h1 = h2 = inArr[0] << 3;

//       if (inlen > 1) { h2 += inArr[1]; }
//       if (inlen > 2) { h3 = h2 ^ inArr[2]; }

//       if (j > inlen) { j = inlen; }

//       /* Try to lookup substrings into the hash table, starting from the
//        * longer to the shorter substrings */

//       for (; j > 0; j--) {
        
//         if (j == 1) {
//           slot = SMAZ_CB[h1 % 241];
//         } else if (j == 2) {
//           slot = SMAZ_CB[h2 % 241];
//         } else {
//           slot = SMAZ_CB[h3 % 241];
//         }

//         while (slot[0]) {

//           if (slot[0] == j && Strings._compare(slot + 1, inArr, j) == 0) {
            
//             /* Match found in the hash table,
//              * prepare a verbatim bytes flush if needed */

//             if (verblen) {
//                 needed = (verblen == 1) ? 2 : 2 + verblen;
                
//                 flush = outIdx;

//                 outIdx += needed;
//                 outlen -= needed;
//             }
            
//             /* Emit the byte */
//             if (outlen <= 0) 
//               return outlen + 1;

//             outIdx[0] = slot[slot[0] + 1];
//             outIdx++;
//             outlen--;
            
//             inlen -= j;
//             inArr += j;
            
//             assembly { jump(out) }
          
//           } else {
//             slot += slot[0] + 2;
//           }
//         }
//       }

//       /* Match not found - add the byte to the verbatim buffer */
//       verb[verblen] = inArr[0];
//       verblen++;
//       inlen--;
//       inIdx++;

// assembly { out: }

//       /* Prepare a flush if we reached the flush length limit, and there
//        * is not already a pending flush operation. */

//       if (!flush && (verblen == 256 || (verblen > 0 && inlen == 0))) {
//         needed = (verblen == 1) ? 2 : 2 + verblen;
        
//         flush = outIdx;

//         outIdx += needed;
//         outlen -= needed;
        
//         if (outlen < 0) {
//           return outlen + 1;
//         }
//       }
      
//       /* Perform a verbatim flush if needed */
//       if (flush) {
//         if (verblen == 1) {
//           flush[0] = 254;
//           flush[1] = verb[0];
        
//         } else {
//           flush[0] = 255;
//           flush[1] = verblen - 1;
          
//           Strings._memcpy(flush + 2, verb, verblen);
//         }
//         delete flush;
//         delete verblen;
//       }
//     }
//     return outIdx;
  }
}