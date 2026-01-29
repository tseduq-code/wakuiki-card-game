interface CardProps {
  text: string;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  variant?: 'default' | 'purpose' | 'deck' | 'small' | 'tiny';
  isNewlyDrawn?: boolean;
}

export function Card({ text, onClick, selected, disabled, variant = 'default', isNewlyDrawn = false }: CardProps) {
  const baseClasses = "bg-white border-2 rounded-lg shadow-md transition-all duration-200 flex items-center justify-center text-center font-medium cursor-pointer relative";
  const hoverClasses = !disabled ? "hover:shadow-lg hover:scale-105" : "";
  const selectedClasses = selected ? "border-blue-500 bg-blue-50 ring-4 ring-blue-200" : "border-gray-300";
  const newlyDrawnClasses = isNewlyDrawn ? "bg-green-50 border-green-500 border-4 ring-4 ring-green-200 shadow-2xl" : "";
  const disabledClasses = disabled ? "opacity-50 cursor-not-allowed" : "";

  const sizeClasses = {
    default: "w-32 h-44 text-base p-3",
    purpose: "w-64 h-32 text-lg p-4",
    deck: "w-24 h-36 text-sm p-2",
    small: "w-20 h-28 text-xs p-2",
    tiny: "w-16 h-20 text-[0.6rem] p-1"
  };

  return (
    <div
      className={`${baseClasses} ${hoverClasses} ${selectedClasses} ${newlyDrawnClasses} ${disabledClasses} ${sizeClasses[variant]}`}
      onClick={disabled ? undefined : onClick}
    >
      {isNewlyDrawn && (
        <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-lg">
          NEW
        </span>
      )}
      <span className="break-words">{text}</span>
    </div>
  );
}
