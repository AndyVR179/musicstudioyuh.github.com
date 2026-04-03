body { font-family: system-ui, sans-serif; }

.key {
  width: 60px;
  height: 240px;
  background: #f1f1f1;
  border: 2px solid #333;
  border-radius: 0 0 8px 8px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 12px;
  font-weight: bold;
  color: #111;
  user-select: none;
  transition: all 0.05s;
}

.key.black {
  width: 40px;
  height: 160px;
  background: #222;
  color: #eee;
  margin-left: -20px;
  margin-right: -20px;
  z-index: 10;
  border-radius: 0 0 6px 6px;
}

.key.active {
  background: #f97316 !important;
  transform: scale(0.95);
}

.note-cell {
  width: 50px;
  height: 28px;
  background: #27272a;
  border: 1px solid #3f3f46;
  cursor: pointer;
}

.note-cell.active {
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
}
