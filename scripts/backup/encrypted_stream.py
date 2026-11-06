#!/usr/bin/env python3
"""Authenticated encryption for backup streams; keys never enter command arguments.

Uses AES-256-GCM from cryptography. The key is a separate, owner-readable-only
32-byte file. A restore must verify the complete authentication tag BEFORE using
any plaintext. The verification helper uses an unlinked temporary file for that.
"""
import argparse
from contextlib import contextmanager
import os
from pathlib import Path
import stat
import sys
import tempfile

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

MAGIC = b'MYDNDB01'
CHUNK = 1024 * 1024

def read_key(path):
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077:
        raise ValueError('Key file must be a regular owner-readable-only file (chmod 600).')
    key = path.read_bytes()
    if len(key) != 32:
        raise ValueError('Expected a generated 32-byte encryption key.')
    return key

def encrypt(source, destination, key):
    nonce = os.urandom(12)
    cipher = Cipher(algorithms.AES(key), modes.GCM(nonce)).encryptor()
    cipher.authenticate_additional_data(MAGIC)
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(MAGIC + nonce)
            while chunk := source.read(CHUNK):
                output.write(cipher.update(chunk))
            output.write(cipher.finalize())
            output.write(cipher.tag)
    except BaseException:
        destination.unlink(missing_ok=True)
        raise

@contextmanager
def verified_plaintext(source, key):
    """No caller sees plaintext until the entire GCM tag has been verified."""
    with source.open('rb') as encrypted:
        size = source.stat().st_size
        if size < len(MAGIC) + 12 + 16 or encrypted.read(len(MAGIC)) != MAGIC:
            raise ValueError('Not a supported encrypted backup.')
        nonce = encrypted.read(12)
        encrypted.seek(-16, os.SEEK_END)
        tag = encrypted.read(16)
        encrypted.seek(len(MAGIC) + 12)
        decryptor = Cipher(algorithms.AES(key), modes.GCM(nonce, tag)).decryptor()
        decryptor.authenticate_additional_data(MAGIC)
        remaining = size - len(MAGIC) - 12 - 16
        with tempfile.TemporaryFile() as plaintext:
            while remaining:
                chunk = encrypted.read(min(CHUNK, remaining))
                if not chunk:
                    raise ValueError('Truncated encrypted backup.')
                plaintext.write(decryptor.update(chunk))
                remaining -= len(chunk)
            plaintext.write(decryptor.finalize())
            plaintext.seek(0)
            yield plaintext

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    init = sub.add_parser('init-key')
    init.add_argument('--output', type=Path, required=True)
    enc = sub.add_parser('encrypt')
    enc.add_argument('--key-file', type=Path, required=True)
    enc.add_argument('--output', type=Path, required=True)
    verify = sub.add_parser('verify')
    verify.add_argument('--key-file', type=Path, required=True)
    verify.add_argument('archive', type=Path)
    args = parser.parse_args()
    if args.command == 'init-key':
        fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as output:
            output.write(os.urandom(32))
        print('Encryption key created. Keep it separately from the backup; its value was not printed.')
    elif args.command == 'encrypt':
        encrypt(sys.stdin.buffer, args.output, read_key(args.key_file))
    else:
        with verified_plaintext(args.archive, read_key(args.key_file)):
            print('Authenticated backup integrity verified; no plaintext was exported.')

if __name__ == '__main__':
    main()
