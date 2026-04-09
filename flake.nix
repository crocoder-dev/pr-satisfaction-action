{
  description = "PR Satisfaction Action - TypeScript GitHub Action";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          name = "pr-satisfaction-action";

          buildInputs = with pkgs; [
            nodejs
            typescript
          ];

          shellHook = ''
            echo "🚀 PR Satisfaction Action dev shell"
            echo "Node: $(node --version)"
            echo "npm: $(npm --version)"
            echo "TypeScript: $(tsc --version)"
            echo ""
            echo "Available commands:"
            echo "  npm run build  - Build the TypeScript project"
            echo "  npm test       - Run tests"
          '';
        };
      }
    );
}
