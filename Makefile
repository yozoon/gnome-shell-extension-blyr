UUID = blyr@yozoon.dev.gmail.com
BUILDDIR = build
SOURCEDIR = $(UUID)
LOCALPREFIX = $(HOME)/.local/share/gnome-shell/extensions

all: 
	@ # Ensure that build/ exists
	@ mkdir -p "$(BUILDDIR)"
	@ # Ensure that extensions/ directory exists
	@ mkdir -p "$(LOCALPREFIX)"
	@ # Compile gschemas
	@ if [ -d "$(SOURCEDIR)/schemas/" ]; then \
	    glib-compile-schemas "$(SOURCEDIR)/schemas/"; \
	else \
	    echo "Gschema directory not found."; \
	fi

zip-file: all
	@ # Create zip of the source directory
	@ ( cd "$(SOURCEDIR)"; \
	zip -r "../$(BUILDDIR)/$(UUID).zip" . );

local-install: all local-uninstall
	@ cp -rf "$(SOURCEDIR)" "$(LOCALPREFIX)/$(UUID)"
	@ echo "Extension successfully installed."

local-uninstall:
	@ # If installed, remove the extension
	@ if [ -d "$(LOCALPREFIX)/$(UUID)" ]; then \
	    rm -rf "$(LOCALPREFIX)/$(UUID)"; \
	    echo "Extension successfully removed."; \
	else \
	    echo "Nothing to remove."; \
	fi

clean:
	@ # Delete all items in the build/ directory
	@ if [ -d "$(BUILDDIR)" ]; then \
	    rm -rf "$(BUILDDIR)/"; \
	    echo "Files successfully removed.";\
	else \
	    echo "Nothing to be done here."; \
	fi
    
