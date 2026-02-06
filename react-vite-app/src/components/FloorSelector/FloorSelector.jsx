import './FloorSelector.css';

function FloorSelector({ selectedFloor, onFloorSelect, floors = [1, 2, 3, 4] }) {
  return (
    <div className="floor-selector">
      <div className="floor-header">
        <span className="floor-icon">🏢</span>
        <span>Select Floor</span>
      </div>
      <div className="floor-buttons">
        {floors.map((floor) => (
          <button
            key={floor}
            className={`floor-button ${selectedFloor === floor ? 'selected' : ''}`}
            onClick={() => onFloorSelect(floor)}
          >
            <span className="floor-number">{floor}</span>
            <span className="floor-label">
              {floor === 1 ? '1st' : floor === 2 ? '2nd' : floor === 3 ? '3rd' : `${floor}th`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default FloorSelector;
